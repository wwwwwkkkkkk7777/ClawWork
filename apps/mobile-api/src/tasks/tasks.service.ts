import { randomUUID } from "node:crypto";
import { BadGatewayException, Injectable } from "@nestjs/common";
import type { TaskStreamEvent } from "@clawwork/shared-types";

type CreateTaskInput = {
  input: {
    text: string;
    fileIds: string[];
  };
  preferredTone: string;
  preferredLength: string;
};

type TaskRecord = {
  taskId: string;
  sessionId: string;
  input: CreateTaskInput["input"];
  preferredTone: string;
  preferredLength: string;
  status: "queued" | "running" | "completed" | "failed";
  createdAt: string;
  runId?: string;
  adapterStreamUrl?: string;
};

type FileRecord = {
  fileId: string;
  filename: string;
  uploadedAt: string;
};

@Injectable()
export class TasksService {
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly files = new Map<string, FileRecord>();

  async createTask(input: CreateTaskInput) {
    const taskId = randomUUID();
    const sessionId = randomUUID();
    const task: TaskRecord = {
      taskId,
      sessionId,
      input: input.input,
      preferredTone: input.preferredTone,
      preferredLength: input.preferredLength,
      status: "queued",
      createdAt: new Date().toISOString()
    };

    this.tasks.set(taskId, task);

    const adapterUrl = process.env.OPENCLAW_ADAPTER_URL;
    if (adapterUrl) {
      const accepted = await this.requestGatewayExecution(adapterUrl, task);
      task.runId = accepted.runId;
      task.adapterStreamUrl = accepted.streamUrl;
      task.status = "running";
    }

    return {
      taskId,
      sessionId,
      streamUrl: `/tasks/${taskId}/stream`,
      initialStatus: task.status
    };
  }

  getTask(taskId: string) {
    return this.tasks.get(taskId) ?? null;
  }

  listHistory() {
    return [...this.tasks.values()].map((task) => ({
      taskId: task.taskId,
      sessionId: task.sessionId,
      title: task.input.text.slice(0, 40),
      status: task.status,
      createdAt: task.createdAt
    }));
  }

  createUploadUrl(filename: string) {
    const fileId = randomUUID();
    return {
      fileId,
      uploadUrl: `http://localhost:9000/clawwork/${fileId}/${filename}`
    };
  }

  completeUpload(fileId: string, filename: string) {
    const file = {
      fileId,
      filename,
      uploadedAt: new Date().toISOString()
    };

    this.files.set(fileId, file);
    return file;
  }

  getTaskStreamSource(taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task?.adapterStreamUrl) {
      return null;
    }

    return {
      taskId: task.taskId,
      sessionId: task.sessionId,
      runId: task.runId,
      url: task.adapterStreamUrl
    };
  }

  applyStreamEvent(event: TaskStreamEvent) {
    const task = this.tasks.get(event.taskId);
    if (!task) {
      return;
    }

    if (event.type === "task.accepted") {
      task.runId = event.runId;
      task.status = "running";
      return;
    }

    if (event.type === "task.completed") {
      task.status = "completed";
      return;
    }

    if (event.type === "task.failed") {
      task.status = "failed";
    }
  }

  private async requestGatewayExecution(adapterUrl: string, task: TaskRecord) {
    const response = await fetch(`${adapterUrl}/gateway/tasks/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        taskId: task.taskId,
        sessionId: task.sessionId,
        message: task.input.text
      })
    });

    if (!response.ok) {
      const payload = await response
        .json()
        .catch(() => ({ message: "adapter request failed" }));
      throw new BadGatewayException(
        typeof payload?.message === "string"
          ? payload.message
          : "adapter request failed"
      );
    }

    const payload = (await response.json()) as {
      runId: string;
      streamUrl: string;
    };

    return {
      runId: payload.runId,
      streamUrl: payload.streamUrl.startsWith("http")
        ? payload.streamUrl
        : `${adapterUrl}${payload.streamUrl}`
    };
  }
}
