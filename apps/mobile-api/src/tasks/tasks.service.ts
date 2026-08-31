import { randomUUID } from "node:crypto";
import { prisma, Prisma } from "@clawwork/database";
import {
  TaskStreamEventSchema,
  ArtifactResultSchema,
  type ArtifactResult,
  type FileRecord,
  type TaskStreamEvent
} from "@clawwork/shared-types";
import { routeTask } from "@clawwork/task-router";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
  PayloadTooLargeException,
  UnsupportedMediaTypeException
} from "@nestjs/common";
import {
  ABSOLUTE_MAX_UPLOAD_BYTES,
  type CompleteUploadDto,
  type CreateUploadDto
} from "../files/files.dto";
import { TaskEventHub, type PersistedTaskEvent } from "../stream/task-event-hub";
import { S3StorageService } from "../storage/s3-storage.service";
import { TaskQueueService } from "../queue/task-queue.service";
import { AbuseProtectionService } from "../security/abuse-protection.service";
import { PushService } from "../push/push.service";
import type { CreateTaskDto, HistoryQueryDto } from "./tasks.dto";

type CreateTaskResult = {
  taskId: string;
  sessionId: string;
  streamUrl: string;
  initialStatus: string;
  errorMessage?: string;
};

type GatewayTaskFile = {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  contentUrl: string;
};

type EnqueueOptions = {
  sessionId?: string;
  parentTaskId?: string;
};

const SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/markdown",
  "text/plain",
  "text/csv"
]);

function asNonEmptyString(input: unknown) {
  return typeof input === "string" ? input.trim() : "";
}

function asPositiveInteger(input: string | undefined, fallback: number) {
  const parsed = Number(input);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeFilename(filename: string) {
  const cleaned = filename
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ");
  return cleaned || "file";
}

function maxUploadBytes() {
  return Math.min(
    ABSOLUTE_MAX_UPLOAD_BYTES,
    asPositiveInteger(process.env.MAX_UPLOAD_BYTES, 10 * 1024 * 1024)
  );
}

function taskTimeoutMs() {
  return asPositiveInteger(process.env.TASK_TIMEOUT_MS, 120_000);
}

function maxResultFileBytes() {
  return asPositiveInteger(process.env.MAX_RESULT_FILE_BYTES, 25 * 1024 * 1024);
}

function isTerminalStatus(status: string) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function resultArtifactOrigins() {
  const configured = asNonEmptyString(process.env.RESULT_ARTIFACT_ALLOWED_ORIGINS)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).origin);
  if (configured.length > 0) return new Set(configured);

  const gatewayUrl = asNonEmptyString(process.env.OPENCLAW_GATEWAY_URL);
  if (!gatewayUrl) return new Set<string>();
  const url = new URL(gatewayUrl);
  if (url.protocol === "ws:") url.protocol = "http:";
  if (url.protocol === "wss:") url.protocol = "https:";
  return new Set([url.origin]);
}

function decodeHistoryCursor(cursor?: string) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      updatedAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.updatedAt !== "string" || typeof parsed.id !== "string") {
      throw new Error("invalid cursor");
    }
    const updatedAt = new Date(parsed.updatedAt);
    if (Number.isNaN(updatedAt.getTime()) || !parsed.id) throw new Error("invalid cursor");
    return { updatedAt, id: parsed.id };
  } catch {
    throw new BadRequestException("invalid history cursor");
  }
}

function encodeHistoryCursor(input: { updatedAt: Date; id: string }) {
  return Buffer.from(
    JSON.stringify({ updatedAt: input.updatedAt.toISOString(), id: input.id })
  ).toString("base64url");
}

function toFileRecord(file: {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date | null;
  status: string;
  storageKey: string;
}): FileRecord {
  return {
    fileId: file.id,
    filename: file.filename,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    uploadedAt: file.uploadedAt?.toISOString() ?? null,
    status:
      file.status === "uploaded" || file.status === "failed"
        ? file.status
        : "uploading",
    storageKey: file.storageKey
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parsePersistedEvent(payload: Prisma.JsonValue) {
  return TaskStreamEventSchema.parse(payload);
}

function buildExecutionMessage(input: {
  text: string;
  taskType: string;
  tone: string;
  length: string;
}) {
  return [
    input.text.trim(),
    "",
    "ClawWork delivery requirements:",
    `- task type: ${input.taskType}`,
    `- preferred tone: ${input.tone}`,
    `- preferred length: ${input.length}`,
    "Return a useful deliverable first; the user may request revisions afterward."
  ].join("\n");
}

@Injectable()
export class TasksService implements OnModuleInit, OnModuleDestroy {
  private readonly activeRelays = new Map<string, AbortController>();
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(TaskEventHub) private readonly eventHub: TaskEventHub,
    @Inject(S3StorageService) private readonly storage: S3StorageService,
    @Inject(TaskQueueService) private readonly taskQueue: TaskQueueService,
    @Inject(AbuseProtectionService)
    private readonly abuseProtection: AbuseProtectionService,
    @Inject(PushService) private readonly push: PushService
  ) {}

  async onModuleInit() {
    await this.storage.ensureBucket();
    this.taskQueue.start(
      (taskId) => this.processQueuedTask(taskId),
      (taskId, error) =>
        this.failTask(
          taskId,
          "code" in error && typeof error.code === "string"
            ? error.code
            : "TASK_QUEUE_EXHAUSTED",
          error.message || "task dispatch retries exhausted"
        )
    );
    const queuedTasks = await prisma.task.findMany({
      where: { status: "queued" },
      select: { id: true },
      take: 10_000
    });
    for (const task of queuedTasks) {
      const jobId = await this.taskQueue.enqueue(task.id, true);
      await prisma.task.update({ where: { id: task.id }, data: { queueJobId: jobId } });
    }
    const runningTasks = await prisma.task.findMany({
      where: { status: "running", adapterStreamUrl: { not: null } },
      select: { id: true, adapterStreamUrl: true, startedAt: true }
    });

    for (const task of runningTasks) {
      if (task.adapterStreamUrl) {
        const elapsed = task.startedAt ? Date.now() - task.startedAt.getTime() : 0;
        const remaining = taskTimeoutMs() - elapsed;
        if (remaining <= 0) {
          await this.requestGatewayCancellation(task.id).catch(() => undefined);
          await this.failTask(task.id, "TASK_TIMEOUT", "task execution timed out");
        } else {
          this.startAdapterRelay(task.id, task.adapterStreamUrl, remaining);
        }
      }
    }
    this.cleanupTimer = setInterval(
      () => void this.cleanupStaleFiles().catch((error: unknown) => {
        console.error(JSON.stringify({
          level: "error",
          event: "file_cleanup_failed",
          message: error instanceof Error ? error.message : "file cleanup failed"
        }));
      }),
      asPositiveInteger(process.env.FILE_CLEANUP_INTERVAL_MS, 15 * 60_000)
    );
    this.cleanupTimer.unref?.();
    void this.cleanupStaleFiles().catch((error: unknown) => {
      console.error(JSON.stringify({
        level: "error",
        event: "initial_file_cleanup_failed",
        message: error instanceof Error ? error.message : "file cleanup failed"
      }));
    });
  }

  async onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    for (const controller of this.activeRelays.values()) {
      controller.abort();
    }
    this.activeRelays.clear();
    await this.taskQueue.close();
    this.storage.destroy();
  }

  createTask(userId: string, input: CreateTaskDto): Promise<CreateTaskResult> {
    return this.enqueueTask(userId, input);
  }

  async createFollowUp(
    userId: string,
    taskId: string,
    input: CreateTaskDto
  ): Promise<CreateTaskResult> {
    const parentTask = await prisma.task.findFirst({ where: { id: taskId, userId } });
    if (!parentTask) {
      throw new NotFoundException("task not found");
    }

    return this.enqueueTask(userId, input, {
      sessionId: parentTask.sessionId,
      parentTaskId: parentTask.id
    });
  }

  async regenerate(userId: string, taskId: string) {
    const source = await prisma.task.findFirst({
      where: { id: taskId, userId },
      include: { files: true }
    });
    if (!source) {
      throw new NotFoundException("task not found");
    }

    return this.enqueueTask(
      userId,
      {
        input: {
          text: source.inputText,
          fileIds: source.files.map((item) => item.fileId)
        },
        preferredTone: source.preferredTone,
        preferredLength: source.preferredLength
      },
      { sessionId: source.sessionId, parentTaskId: source.id }
    );
  }

  async cancelTask(userId: string, taskId: string) {
    const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
    if (!task) throw new NotFoundException("task not found");
    if (isTerminalStatus(task.status)) {
      return { taskId: task.id, status: task.status };
    }

    if (task.status === "queued") {
      await this.taskQueue.cancel(task.id);
    } else if (task.status === "running") {
      await this.requestGatewayCancellation(task.id);
    }

    this.activeRelays.get(task.id)?.abort();
    await this.persistTaskEvent({
      type: "task.cancelled",
      taskId: task.id,
      sessionId: task.sessionId,
      runId: task.runId ?? task.id,
      timestamp: new Date().toISOString(),
      message: "task cancelled by user"
    });
    return { taskId: task.id, status: "cancelled" };
  }

  async getTask(userId: string, taskId: string) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId },
      include: {
        results: {
          orderBy: { versionNo: "asc" },
          include: { artifacts: true }
        },
        files: { include: { file: true } }
      }
    });
    if (!task) {
      throw new NotFoundException("task not found");
    }

    return {
      ...task,
      results: await Promise.all(task.results.map((result) => this.toClientResult(result))),
      files: task.files.map((item) => toFileRecord(item.file))
    };
  }

  async listHistory(userId: string, query: HistoryQueryDto) {
    const cursor = decodeHistoryCursor(query.cursor);
    const limit = query.limit ?? 20;
    const sessions = await prisma.appSession.findMany({
      where: {
        userId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
          ? { title: { contains: query.search.trim(), mode: "insensitive" } }
          : {}),
        ...(cursor
          ? {
              OR: [
                { updatedAt: { lt: cursor.updatedAt } },
                { updatedAt: cursor.updatedAt, id: { lt: cursor.id } }
              ]
            }
          : {})
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: { tasks: { orderBy: { createdAt: "desc" }, take: 1 } }
    });
    const hasMore = sessions.length > limit;
    const page = sessions.slice(0, limit);
    const items = page.flatMap((session) => {
      const task = session.tasks[0];
      return task
        ? [
            {
              taskId: task.id,
              sessionId: session.id,
              title: session.title,
              prompt: task.inputText,
              status: task.status,
              errorMessage: task.errorMessage,
              createdAt: task.createdAt.toISOString(),
              updatedAt: session.updatedAt.toISOString()
            }
          ]
        : [];
    });
    const last = page.at(-1);
    return {
      items,
      nextCursor: hasMore && last ? encodeHistoryCursor(last) : null
    };
  }

  async getHistoryTask(userId: string, taskId: string) {
    const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
    if (!task) {
      throw new NotFoundException("task not found");
    }

    const session = await prisma.appSession.findFirst({
      where: { id: task.sessionId, userId },
      include: {
        tasks: {
          orderBy: { createdAt: "asc" },
          include: {
            results: {
              orderBy: { versionNo: "desc" },
              include: { artifacts: true }
            },
            files: { include: { file: true } }
          }
        },
        results: {
          orderBy: { versionNo: "asc" },
          include: { artifacts: true }
        }
      }
    });
    if (!session) {
      throw new NotFoundException("task history not found");
    }

    return {
      sessionId: session.id,
      title: session.title,
      status: session.status,
      currentTaskId: session.currentTaskId,
      tasks: await Promise.all(session.tasks.map(async (item) => ({
          taskId: item.id,
          parentTaskId: item.parentTaskId,
          inputText: item.inputText,
          status: item.status,
          errorMessage: item.errorMessage,
          createdAt: item.createdAt.toISOString(),
          files: item.files.map((linked) => toFileRecord(linked.file)),
          result: item.results[0] ? await this.toClientResult(item.results[0]) : null
        }))),
      versions: await Promise.all(session.results.map((result) => this.toClientResult(result)))
    };
  }

  async getVersions(userId: string, taskId: string) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId },
      select: { sessionId: true }
    });
    if (!task) {
      throw new NotFoundException("task not found");
    }
    const results = await prisma.taskResult.findMany({
      where: { sessionId: task.sessionId },
      orderBy: { versionNo: "asc" },
      include: { artifacts: true }
    });
    return Promise.all(results.map((result) => this.toClientResult(result)));
  }

  async listActiveTasks(userId: string) {
    return prisma.task.findMany({
      where: { userId, status: { in: ["queued", "running"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        sessionId: true,
        inputText: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  async deleteHistoryTask(userId: string, taskId: string) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId },
      select: { sessionId: true }
    });
    if (!task) throw new NotFoundException("task not found");
    const activeCount = await prisma.task.count({
      where: { sessionId: task.sessionId, status: { in: ["queued", "running"] } }
    });
    if (activeCount > 0) {
      throw new ConflictException("cancel active tasks before deleting history");
    }
    const artifacts = await prisma.resultArtifact.findMany({
      where: { task: { sessionId: task.sessionId, userId } },
      select: { storageKey: true }
    });
    for (const artifact of artifacts) await this.storage.deleteObject(artifact.storageKey);
    await prisma.appSession.delete({ where: { id: task.sessionId } });
    await this.cleanupUnreferencedFiles(userId);
    return { deleted: true, sessionId: task.sessionId };
  }

  async assertTaskOwnership(userId: string, taskId: string) {
    const exists = await prisma.task.count({ where: { id: taskId, userId } });
    if (!exists) {
      throw new NotFoundException("task not found");
    }
  }

  async listTaskEvents(userId: string, taskId: string, afterId = 0) {
    await this.assertTaskOwnership(userId, taskId);
    const events = await prisma.taskEvent.findMany({
      where: { taskId, id: { gt: afterId } },
      orderBy: { id: "asc" }
    });
    return Promise.all(events.map(
      async (row): Promise<PersistedTaskEvent> => ({
        id: row.id,
        event: await this.hydrateStoredEvent(parsePersistedEvent(row.payload))
      })
    ));
  }

  subscribeTaskEvents(taskId: string, listener: (event: PersistedTaskEvent) => void) {
    return this.eventHub.subscribe(taskId, listener);
  }

  async createUploadUrl(userId: string, input: CreateUploadDto) {
    if (!SUPPORTED_MIME_TYPES.has(input.mimeType)) {
      throw new UnsupportedMediaTypeException("file type is not supported");
    }
    if (input.sizeBytes > maxUploadBytes()) {
      throw new PayloadTooLargeException(
        `file exceeds the ${maxUploadBytes()} byte upload limit`
      );
    }

    const fileId = randomUUID();
    const filename = sanitizeFilename(input.filename);
    const storageKey = `users/${userId}/${fileId}/${filename}`;
    await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ locked: string }>>`
        SELECT pg_advisory_xact_lock(hashtextextended(${`storage:${userId}`}, 0))::text AS locked
      `;
      const [fileUsage, artifactUsage] = await Promise.all([
        transaction.file.aggregate({
          where: { userId, status: { not: "failed" } },
          _sum: { sizeBytes: true }
        }),
        transaction.resultArtifact.aggregate({
          where: { userId },
          _sum: { sizeBytes: true }
        })
      ]);
      const usedBytes =
        (fileUsage._sum.sizeBytes ?? 0) + (artifactUsage._sum.sizeBytes ?? 0);
      const storageLimit = asPositiveInteger(
        process.env.USER_STORAGE_BYTES,
        1024 * 1024 * 1024
      );
      if (usedBytes + input.sizeBytes > storageLimit) {
        throw new HttpException("user storage quota exceeded", 429);
      }
      await transaction.file.create({
        data: {
          id: fileId,
          userId,
          filename,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          status: "uploading",
          storageKey
        }
      });
    });
    try {
      const uploadUrl = await this.storage.createUploadUrl(
        storageKey,
        input.mimeType,
        input.sizeBytes
      );
      return { fileId, uploadUrl, storageKey };
    } catch (error) {
      await prisma.file.update({ where: { id: fileId }, data: { status: "failed" } });
      throw error;
    }
  }

  async completeUpload(userId: string, input: CompleteUploadDto): Promise<FileRecord> {
    const file = await prisma.file.findFirst({ where: { id: input.fileId, userId } });
    if (!file) {
      throw new NotFoundException("file upload not found");
    }
    if (
      file.filename !== sanitizeFilename(input.filename) ||
      file.mimeType !== input.mimeType ||
      file.sizeBytes !== input.sizeBytes ||
      file.storageKey !== input.storageKey
    ) {
      throw new BadRequestException("upload completion metadata does not match");
    }

    const object = await this.storage.inspectObject(file.storageKey);
    if (object.sizeBytes !== file.sizeBytes || object.mimeType !== file.mimeType) {
      await prisma.file.update({ where: { id: file.id }, data: { status: "failed" } });
      throw new BadRequestException("stored object metadata does not match upload request");
    }
    const completed = await prisma.file.update({
      where: { id: file.id },
      data: { status: "uploaded", uploadedAt: new Date(), etag: object.etag }
    });
    return toFileRecord(completed);
  }

  async getFile(userId: string, fileId: string) {
    const file = await prisma.file.findFirst({ where: { id: fileId, userId } });
    if (!file) {
      throw new NotFoundException("file not found");
    }
    return {
      ...toFileRecord(file),
      ...(file.status === "uploaded"
        ? { downloadUrl: await this.storage.createDownloadUrl(file.storageKey) }
        : {})
    };
  }

  async deleteFile(userId: string, fileId: string) {
    const file = await prisma.file.findFirst({
      where: { id: fileId, userId },
      include: { _count: { select: { tasks: true } } }
    });
    if (!file) throw new NotFoundException("file not found");
    if (file._count.tasks > 0) {
      throw new ConflictException("file is referenced by task history");
    }
    await this.storage.deleteObject(file.storageKey);
    await prisma.file.delete({ where: { id: file.id } });
    return { deleted: true, fileId: file.id };
  }

  private async enqueueTask(
    userId: string,
    input: CreateTaskDto,
    options: EnqueueOptions = {}
  ): Promise<CreateTaskResult> {
    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId }
    });
    const preferredTone = input.preferredTone ?? settings.preferredTone;
    const preferredLength = input.preferredLength ?? settings.preferredLength;
    const route = routeTask({ text: input.input.text, fileIds: input.input.fileIds });
    const files = await prisma.file.findMany({
      where: { id: { in: input.input.fileIds }, userId, status: "uploaded" }
    });
    if (files.length !== new Set(input.input.fileIds).size) {
      throw new BadRequestException("one or more files are missing, unowned, or incomplete");
    }

    await this.abuseProtection.reserveDailyTask(userId);
    const task = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw<Array<{ locked: string }>>`
        SELECT pg_advisory_xact_lock(hashtextextended(${`tasks:${userId}`}, 0))::text AS locked
      `;
      const activeTasks = await transaction.task.count({
        where: { userId, status: { in: ["queued", "running"] } }
      });
      const concurrentLimit = asPositiveInteger(
        process.env.USER_CONCURRENT_TASK_LIMIT,
        3
      );
      if (activeTasks >= concurrentLimit) {
        throw new HttpException("concurrent task quota exceeded", 429);
      }
      const session = options.sessionId
        ? await transaction.appSession.findFirst({
            where: { id: options.sessionId, userId }
          })
        : await transaction.appSession.create({
            data: {
              userId,
              title: input.input.text.trim().slice(0, 40),
              status: "queued"
            }
          });
      if (!session) {
        throw new NotFoundException("session not found");
      }

      const created = await transaction.task.create({
        data: {
          sessionId: session.id,
          userId,
          parentTaskId: options.parentTaskId,
          taskType: route.taskType,
          status: "queued",
          inputText: input.input.text.trim(),
          preferredTone,
          preferredLength,
          files: { create: files.map((file) => ({ fileId: file.id })) }
        }
      });
      await transaction.appSession.update({
        where: { id: session.id },
        data: { currentTaskId: created.id, status: "queued" }
      });
      return created;
    }).catch(async (error: unknown) => {
      await this.abuseProtection.releaseDailyTask(userId);
      throw error;
    });

    try {
      const jobId = await this.taskQueue.enqueue(task.id);
      await prisma.task.update({ where: { id: task.id }, data: { queueJobId: jobId } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "task queue unavailable";
      await this.failTask(task.id, "TASK_QUEUE_UNAVAILABLE", message);
      return {
        taskId: task.id,
        sessionId: task.sessionId,
        streamUrl: `/tasks/${task.id}/stream`,
        initialStatus: "failed",
        errorMessage: message
      };
    }
    return {
      taskId: task.id,
      sessionId: task.sessionId,
      streamUrl: `/tasks/${task.id}/stream`,
      initialStatus: "queued"
    };
  }

  private async processQueuedTask(taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { files: { include: { file: true } } }
    });
    if (!task || task.status !== "queued") return;

    await prisma.task.update({
      where: { id: task.id },
      data: { attemptCount: { increment: 1 } }
    });
    const gatewayFiles = await Promise.all(
      task.files.map(async ({ file }) => {
        const object = await this.storage.inspectObject(file.storageKey);
        if (
          object.sizeBytes !== file.sizeBytes ||
          object.mimeType !== file.mimeType ||
          !file.etag ||
          object.etag !== file.etag
        ) {
          const error = new Error(`file integrity check failed for ${file.filename}`) as Error & {
            code: string;
          };
          error.code = "FILE_INTEGRITY_FAILED";
          throw error;
        }
        return {
          fileId: file.id,
          filename: file.filename,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          storageKey: file.storageKey,
          contentUrl: await this.storage.createDownloadUrl(file.storageKey, false)
        };
      })
    );
    await this.dispatchTask(task, gatewayFiles);
  }

  private async dispatchTask(
    task: {
      id: string;
      sessionId: string;
      inputText: string;
      taskType: string;
      preferredTone: string;
      preferredLength: string;
    },
    files: GatewayTaskFile[]
  ) {
    const adapterUrl = asNonEmptyString(process.env.OPENCLAW_ADAPTER_URL);
    if (!adapterUrl) {
      const error = new Error("OpenClaw adapter is not configured") as Error & {
        code: string;
      };
      error.code = "GATEWAY_UNAVAILABLE";
      throw error;
    }

    const accepted = await this.requestGatewayExecution(adapterUrl, task, files);
    const streamUrl = accepted.streamUrl.startsWith("http")
      ? accepted.streamUrl
      : `${adapterUrl}${accepted.streamUrl}`;
    const updated = await prisma.task.updateMany({
      where: { id: task.id, status: "queued" },
      data: {
        status: "running",
        runId: accepted.runId,
        adapterStreamUrl: streamUrl,
        startedAt: new Date(),
        errorCode: null,
        errorMessage: null
      }
    });
    if (updated.count === 0) {
      await this.requestGatewayCancellation(task.id).catch(() => undefined);
      return;
    }
    await prisma.appSession.update({
      where: { id: task.sessionId },
      data: { status: "running" }
    });
    this.startAdapterRelay(task.id, streamUrl);
  }

  private async requestGatewayExecution(
    adapterUrl: string,
    task: {
      id: string;
      sessionId: string;
      inputText: string;
      taskType: string;
      preferredTone: string;
      preferredLength: string;
    },
    files: GatewayTaskFile[]
  ) {
    const response = await fetch(`${adapterUrl}/gateway/tasks/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.ADAPTER_INTERNAL_TOKEN
          ? { Authorization: `Bearer ${process.env.ADAPTER_INTERNAL_TOKEN}` }
          : {})
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        taskId: task.id,
        sessionId: task.sessionId,
        message: buildExecutionMessage({
          text: task.inputText,
          taskType: task.taskType,
          tone: task.preferredTone,
          length: task.preferredLength
        }),
        files
      })
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        code?: unknown;
        message?: unknown;
      } | null;
      const error = new Error(
        typeof payload?.message === "string" ? payload.message : "adapter request failed"
      ) as Error & { code: string };
      error.code = typeof payload?.code === "string" ? payload.code : "GATEWAY_UNAVAILABLE";
      throw error;
    }

    const payload = (await response.json()) as {
      runId?: unknown;
      streamUrl?: unknown;
    };
    if (typeof payload.runId !== "string" || typeof payload.streamUrl !== "string") {
      throw new Error("adapter returned invalid execution metadata");
    }
    return { runId: payload.runId, streamUrl: payload.streamUrl };
  }

  private async requestGatewayCancellation(taskId: string) {
    const adapterUrl = asNonEmptyString(process.env.OPENCLAW_ADAPTER_URL);
    if (!adapterUrl) {
      throw new ConflictException("adapter is unavailable; running task was not cancelled");
    }
    const response = await fetch(`${adapterUrl}/gateway/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: "POST",
      headers: process.env.ADAPTER_INTERNAL_TOKEN
        ? { Authorization: `Bearer ${process.env.ADAPTER_INTERNAL_TOKEN}` }
        : {},
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: unknown } | null;
      throw new ConflictException(
        typeof payload?.message === "string"
          ? payload.message
          : "running task could not be cancelled"
      );
    }
  }

  private startAdapterRelay(taskId: string, url: string, timeoutMs = taskTimeoutMs()) {
    if (this.activeRelays.has(taskId)) {
      return;
    }
    const controller = new AbortController();
    this.activeRelays.set(taskId, controller);
    void this.relayAdapterEvents(taskId, url, controller, timeoutMs);
  }

  private async relayAdapterEvents(
    taskId: string,
    url: string,
    controller: AbortController,
    timeoutMs: number
  ) {
    let terminalEventSeen = false;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const lastPersistedEvent = await prisma.taskEvent.findFirst({
        where: { taskId, sourceEventId: { not: null } },
        orderBy: { id: "desc" },
        select: { sourceEventId: true }
      });
      const response = await fetch(url, {
        headers: {
          Accept: "text/event-stream",
          ...(process.env.ADAPTER_INTERNAL_TOKEN
            ? { Authorization: `Bearer ${process.env.ADAPTER_INTERNAL_TOKEN}` }
            : {}),
          ...(lastPersistedEvent?.sourceEventId
            ? { "Last-Event-ID": lastPersistedEvent.sourceEventId }
            : {})
        },
        signal: controller.signal
      });
      if (!response.ok || !response.body) {
        throw new Error(`adapter stream unavailable (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        while (buffer.includes("\n\n")) {
          const separatorIndex = buffer.indexOf("\n\n");
          const rawEvent = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          const parsed = this.parseAdapterEvent(rawEvent);
          if (!parsed) {
            continue;
          }
          await this.persistTaskEvent(parsed.event, parsed.sourceEventId);
          if (
            parsed.event.type === "task.completed" ||
            parsed.event.type === "task.failed" ||
            parsed.event.type === "task.cancelled"
          ) {
            terminalEventSeen = true;
            return;
          }
        }
      }

      if (!terminalEventSeen && !controller.signal.aborted) {
        await this.failTask(taskId, "GATEWAY_STREAM_CLOSED", "gateway stream closed early");
      }
    } catch (error) {
      if (timedOut) {
        await this.requestGatewayCancellation(taskId).catch(() => undefined);
        await this.failTask(taskId, "TASK_TIMEOUT", "task execution timed out");
      } else if (!controller.signal.aborted) {
        await this.failTask(
          taskId,
          "GATEWAY_STREAM_ERROR",
          error instanceof Error ? error.message : "gateway stream failed"
        );
      }
    } finally {
      clearTimeout(timeout);
      if (this.activeRelays.get(taskId) === controller) {
        this.activeRelays.delete(taskId);
      }
    }
  }

  private parseAdapterEvent(rawEvent: string) {
    const lines = rawEvent.split("\n");
    const dataLine = lines.find((line) => line.startsWith("data: "));
    if (!dataLine) {
      return null;
    }
    try {
      const event = TaskStreamEventSchema.parse(JSON.parse(dataLine.slice(6)));
      const sourceEventId = lines.find((line) => line.startsWith("id: "))?.slice(4);
      return { event, sourceEventId };
    } catch {
      return null;
    }
  }

  private async failTask(taskId: string, code: string, message: string) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || isTerminalStatus(task.status)) {
      return;
    }
    await this.persistTaskEvent({
      type: "task.failed",
      taskId: task.id,
      sessionId: task.sessionId,
      runId: task.runId ?? task.id,
      timestamp: new Date().toISOString(),
      code,
      message
    });
  }

  private async persistTaskEvent(event: TaskStreamEvent, sourceEventId?: string) {
    if (sourceEventId) {
      const existing = await prisma.taskEvent.findUnique({
        where: { taskId_sourceEventId: { taskId: event.taskId, sourceEventId } },
        select: { id: true }
      });
      if (existing) return;
    }

    const prepared = await this.prepareTaskEvent(event);
    const persisted = await prisma.$transaction(async (transaction) => {
      const task = await transaction.task.findUnique({
        where: { id: prepared.stored.taskId },
        include: { session: { select: { title: true } } }
      });
      if (!task || isTerminalStatus(task.status)) return null;

      if (sourceEventId) {
        const existing = await transaction.taskEvent.findUnique({
          where: {
            taskId_sourceEventId: { taskId: prepared.stored.taskId, sourceEventId }
          }
        });
        if (existing) return null;
      }

      const row = await transaction.taskEvent.create({
        data: {
          taskId: prepared.stored.taskId,
          sourceEventId,
          type: prepared.stored.type,
          payload: toJson(prepared.stored)
        }
      });

      if (prepared.stored.type === "task.accepted") {
        await transaction.task.update({
          where: { id: task.id },
          data: {
            status: "running",
            runId: prepared.stored.runId,
            startedAt: task.startedAt ?? new Date()
          }
        });
      } else if (prepared.stored.type === "task.failed") {
        await transaction.task.update({
          where: { id: task.id },
          data: {
            status: "failed",
            errorCode: prepared.stored.code,
            errorMessage: prepared.stored.message,
            completedAt: new Date()
          }
        });
        await transaction.appSession.update({
          where: { id: task.sessionId },
          data: { status: "failed" }
        });
      } else if (prepared.stored.type === "task.cancelled") {
        await transaction.task.update({
          where: { id: task.id },
          data: {
            status: "cancelled",
            errorCode: "TASK_CANCELLED",
            errorMessage: prepared.stored.message,
            completedAt: new Date()
          }
        });
        await transaction.appSession.update({
          where: { id: task.sessionId },
          data: { status: "cancelled" }
        });
      } else if (prepared.stored.type === "task.completed") {
        await transaction.$queryRaw<Array<{ locked: string }>>`
          SELECT pg_advisory_xact_lock(hashtextextended(${task.sessionId}, 0))::text AS locked
        `;
        const eventRows = await transaction.taskEvent.findMany({
          where: { taskId: task.id },
          orderBy: { id: "asc" }
        });
        const events = eventRows.map((item) => parsePersistedEvent(item.payload));
        const outputText = events
          .filter(
            (item): item is Extract<TaskStreamEvent, { type: "task.delta" }> =>
              item.type === "task.delta"
          )
          .map((item) => item.delta)
          .join("");
        const structuredResult = [...events].reverse().find(
          (item): item is Extract<TaskStreamEvent, { type: "task.result.created" }> =>
            item.type === "task.result.created"
        )?.result;
        const latestVersion = await transaction.taskResult.findFirst({
          where: { sessionId: task.sessionId },
          orderBy: { versionNo: "desc" },
          select: { versionNo: true }
        });
        const result = await transaction.taskResult.create({
          data: {
            taskId: task.id,
            sessionId: task.sessionId,
            versionNo: (latestVersion?.versionNo ?? 0) + 1,
            outputText,
            outputJson: toJson(structuredResult ?? { type: "text", text: outputText })
          }
        });
        await transaction.resultArtifact.updateMany({
          where: { taskId: task.id, resultId: null },
          data: { resultId: result.id }
        });
        await transaction.task.update({
          where: { id: task.id },
          data: {
            status: "completed",
            completedAt: new Date(),
            errorCode: null,
            errorMessage: null
          }
        });
        await transaction.appSession.update({
          where: { id: task.sessionId },
          data: { status: "completed", currentTaskId: task.id }
        });
      }

      return {
        id: row.id,
        event: prepared.published,
        userId: task.userId,
        title: task.session.title
      };
    });

    if (!persisted) return;
    this.eventHub.publish(prepared.published.taskId, {
      id: persisted.id,
      event: prepared.published
    });
    if (
      prepared.published.type === "task.completed" ||
      prepared.published.type === "task.failed" ||
      prepared.published.type === "task.cancelled"
    ) {
      const status = prepared.published.type.slice("task.".length) as
        | "completed"
        | "failed"
        | "cancelled";
      const message =
        prepared.published.type === "task.completed"
          ? "任务已完成，点击查看结果"
          : prepared.published.type === "task.failed"
            ? `任务失败：${prepared.published.message}`
            : "任务已取消";
      void this.push.notifyTaskTerminal({
        userId: persisted.userId,
        taskId: prepared.published.taskId,
        status,
        title: persisted.title,
        message
      }).catch((error: unknown) => {
        console.error(JSON.stringify({
          level: "error",
          event: "push_notification_failed",
          taskId: prepared.published.taskId,
          message: error instanceof Error ? error.message : "push failed"
        }));
      });
    }
  }

  private async prepareTaskEvent(event: TaskStreamEvent) {
    if (event.type !== "task.result.created") {
      return { stored: event, published: event };
    }
    const parsed = ArtifactResultSchema.safeParse(event.result);
    if (!parsed.success || !parsed.data.artifact.downloadUrl) {
      throw new Error("gateway artifact is missing a downloadable file URL");
    }
    const archived = await this.archiveResultArtifact(event.taskId, parsed.data);
    const stored: TaskStreamEvent = {
      ...event,
      result: {
        type: "artifact",
        artifact: {
          ...archived.artifact,
          downloadUrl: undefined
        }
      }
    };
    const published: TaskStreamEvent = {
      ...event,
      result: {
        type: "artifact",
        artifact: {
          ...archived.artifact,
          downloadUrl: await this.storage.createDownloadUrl(archived.storageKey)
        }
      }
    };
    return { stored, published };
  }

  private async archiveResultArtifact(taskId: string, result: ArtifactResult) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, userId: true }
    });
    if (!task) throw new NotFoundException("task not found");
    const source = new URL(result.artifact.downloadUrl!);
    if (
      (source.protocol !== "http:" && source.protocol !== "https:") ||
      source.username ||
      source.password ||
      !resultArtifactOrigins().has(source.origin)
    ) {
      throw new Error("gateway artifact URL origin is not allowed");
    }
    const response = await fetch(source, {
      redirect: "error",
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok || !response.body) {
      throw new Error(`gateway artifact download failed (${response.status})`);
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxResultFileBytes()) {
      throw new Error("gateway artifact exceeds result file size limit");
    }
    const responseMimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
    if (responseMimeType && responseMimeType !== result.artifact.mimeType) {
      throw new Error("gateway artifact MIME type does not match result metadata");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let sizeBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sizeBytes += value.byteLength;
      if (sizeBytes > maxResultFileBytes()) {
        await reader.cancel();
        throw new Error("gateway artifact exceeds result file size limit");
      }
      chunks.push(value);
    }
    if (sizeBytes < 1) throw new Error("gateway artifact is empty");
    if (result.artifact.sizeBytes !== undefined && result.artifact.sizeBytes !== sizeBytes) {
      throw new Error("gateway artifact size does not match result metadata");
    }
    const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), sizeBytes);
    const fileName = sanitizeFilename(result.artifact.fileName);
    const storageKey = `users/${task.userId}/results/${task.id}/${randomUUID()}/${fileName}`;
    const stored = await this.storage.putObject(storageKey, body, result.artifact.mimeType);
    try {
      const record = await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw<Array<{ locked: string }>>`
          SELECT pg_advisory_xact_lock(hashtextextended(${`storage:${task.userId}`}, 0))::text AS locked
        `;
        const [fileUsage, artifactUsage] = await Promise.all([
          transaction.file.aggregate({
            where: { userId: task.userId, status: { not: "failed" } },
            _sum: { sizeBytes: true }
          }),
          transaction.resultArtifact.aggregate({
            where: { userId: task.userId },
            _sum: { sizeBytes: true }
          })
        ]);
        const usedBytes =
          (fileUsage._sum.sizeBytes ?? 0) + (artifactUsage._sum.sizeBytes ?? 0);
        if (
          usedBytes + sizeBytes >
          asPositiveInteger(process.env.USER_STORAGE_BYTES, 1024 * 1024 * 1024)
        ) {
          throw new HttpException("user storage quota exceeded", 429);
        }
        return transaction.resultArtifact.create({
          data: {
            userId: task.userId,
            taskId: task.id,
            kind: result.artifact.kind,
            fileName,
            mimeType: result.artifact.mimeType,
            sizeBytes,
            storageKey,
            etag: stored.etag,
            previewText: result.artifact.previewText,
            sourceUrl: `${source.origin}${source.pathname}`
          }
        });
      });
      return {
        storageKey,
        artifact: {
          artifactId: record.id,
          kind: result.artifact.kind,
          fileName,
          mimeType: result.artifact.mimeType,
          sizeBytes,
          previewText: result.artifact.previewText
        }
      };
    } catch (error) {
      await this.storage.deleteObject(storageKey).catch(() => undefined);
      throw error;
    }
  }

  private async hydrateStoredEvent(event: TaskStreamEvent): Promise<TaskStreamEvent> {
    if (event.type !== "task.result.created") return event;
    const parsed = ArtifactResultSchema.safeParse(event.result);
    const artifactId = parsed.success ? parsed.data.artifact.artifactId : undefined;
    const artifact = artifactId
      ? await prisma.resultArtifact.findFirst({
          where: { id: artifactId, taskId: event.taskId }
        })
      : null;
    if (!artifact) return event;
    return {
      ...event,
      result: {
        type: "artifact",
        artifact: {
          artifactId: artifact.id,
          kind: artifact.kind as ArtifactResult["artifact"]["kind"],
          fileName: artifact.fileName,
          mimeType: artifact.mimeType,
          sizeBytes: artifact.sizeBytes,
          previewText: artifact.previewText,
          downloadUrl: await this.storage.createDownloadUrl(artifact.storageKey)
        }
      }
    };
  }

  private async toClientResult(result: {
    id: string;
    taskId: string;
    sessionId: string;
    versionNo: number;
    outputText: string;
    outputJson: Prisma.JsonValue;
    createdAt: Date;
    artifacts: Array<{
      id: string;
      kind: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      storageKey: string;
      previewText: string;
    }>;
  }) {
    const parsedOutput = ArtifactResultSchema.safeParse(result.outputJson);
    const outputArtifactId = parsedOutput.success
      ? parsedOutput.data.artifact.artifactId
      : undefined;
    const artifact = result.artifacts.find((item) => item.id === outputArtifactId)
      ?? result.artifacts[0];
    return {
      ...result,
      artifacts: undefined,
      outputJson: artifact
        ? {
            type: "artifact",
            artifact: {
              artifactId: artifact.id,
              kind: artifact.kind,
              fileName: artifact.fileName,
              mimeType: artifact.mimeType,
              sizeBytes: artifact.sizeBytes,
              previewText: artifact.previewText,
              downloadUrl: await this.storage.createDownloadUrl(artifact.storageKey)
            }
          }
        : result.outputJson
    };
  }

  private async cleanupUnreferencedFiles(userId?: string) {
    const retentionHours = asPositiveInteger(
      process.env.UNREFERENCED_FILE_RETENTION_HOURS,
      7 * 24
    );
    const cutoff = new Date(Date.now() - retentionHours * 60 * 60_000);
    const files = await prisma.file.findMany({
      where: {
        ...(userId ? { userId } : {}),
        status: "uploaded",
        updatedAt: { lt: cutoff },
        tasks: { none: {} }
      },
      take: 200
    });
    for (const file of files) {
      await this.storage.deleteObject(file.storageKey);
      await prisma.file.delete({ where: { id: file.id } });
    }
    return files.length;
  }

  private async cleanupStaleFiles() {
    const staleHours = asPositiveInteger(process.env.STALE_UPLOAD_RETENTION_HOURS, 24);
    const cutoff = new Date(Date.now() - staleHours * 60 * 60_000);
    const stale = await prisma.file.findMany({
      where: {
        status: { in: ["uploading", "failed"] },
        updatedAt: { lt: cutoff },
        tasks: { none: {} }
      },
      take: 200
    });
    for (const file of stale) {
      await this.storage.deleteObject(file.storageKey);
      await prisma.file.delete({ where: { id: file.id } });
    }
    const abandonedArtifacts = await prisma.resultArtifact.findMany({
      where: {
        resultId: null,
        createdAt: { lt: cutoff },
        task: { status: { in: ["failed", "cancelled"] } }
      },
      take: 200
    });
    for (const artifact of abandonedArtifacts) {
      await this.storage.deleteObject(artifact.storageKey);
      await prisma.resultArtifact.delete({ where: { id: artifact.id } });
    }
    return stale.length + abandonedArtifacts.length + (await this.cleanupUnreferencedFiles());
  }
}
