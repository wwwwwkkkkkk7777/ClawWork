import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { FileRecord } from "@clawwork/shared-types";
import { TaskEventBroker, type BrokerEvent } from "./event-broker";
import { PersistentGatewayClient } from "./persistent-gateway-client";
import { Counter, Gauge, Registry } from "prom-client";

type AdapterServerOptions = {
  gatewayUrl: string;
  gatewayToken?: string;
  gatewayPassword?: string;
  internalToken?: string;
  allowedContentOrigin?: string;
  port?: number;
  host?: string;
};

type ExecuteTaskPayload = {
  taskId: string;
  sessionId: string;
  message: string;
  files?: Array<
    Pick<FileRecord, "fileId" | "filename" | "mimeType" | "sizeBytes" | "storageKey"> & {
      contentUrl?: string;
      contentPath?: string;
    }
  >;
};

function writeJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

function writeSseEvent(response: ServerResponse, item: BrokerEvent) {
  response.write(`id: ${item.id}\ndata: ${JSON.stringify(item.event)}\n\n`);
}

function isTerminalEvent(event: { type: string }) {
  return event.type === "task.completed" || event.type === "task.failed" || event.type === "task.cancelled";
}

async function readJsonBody<T>(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) {
      const error = new Error("request body exceeds 1 MiB") as Error & { code: string };
      error.code = "PAYLOAD_TOO_LARGE";
      throw error;
    }
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function validateExecutePayload(payload: ExecuteTaskPayload, allowedContentOrigin?: string) {
  if (
    !payload ||
    typeof payload.taskId !== "string" ||
    !payload.taskId ||
    typeof payload.sessionId !== "string" ||
    !payload.sessionId ||
    typeof payload.message !== "string" ||
    payload.message.length > 30_000 ||
    !Array.isArray(payload.files ?? []) ||
    (payload.files?.length ?? 0) > 10
  ) {
    const error = new Error("invalid task execution payload") as Error & { code: string };
    error.code = "INVALID_INPUT";
    throw error;
  }
  for (const file of payload.files ?? []) {
    if (
      typeof file.fileId !== "string" ||
      typeof file.filename !== "string" ||
      typeof file.mimeType !== "string" ||
      !Number.isSafeInteger(file.sizeBytes) ||
      file.sizeBytes < 1 ||
      file.sizeBytes > 25 * 1024 * 1024 ||
      typeof file.storageKey !== "string"
    ) {
      const error = new Error("invalid task file metadata") as Error & { code: string };
      error.code = "INVALID_INPUT";
      throw error;
    }
    if (file.contentUrl) {
      let origin: string;
      try {
        origin = new URL(file.contentUrl).origin;
      } catch {
        const error = new Error("invalid task file URL") as Error & { code: string };
        error.code = "INVALID_INPUT";
        throw error;
      }
      if (allowedContentOrigin && origin !== new URL(allowedContentOrigin).origin) {
        const error = new Error("task file URL is outside object storage") as Error & {
          code: string;
        };
        error.code = "INVALID_FILE_ORIGIN";
        throw error;
      }
    }
  }
}

export async function createAdapterServer(options: AdapterServerOptions) {
  const broker = new TaskEventBroker();
  const gateway = new PersistentGatewayClient({
    gatewayUrl: options.gatewayUrl,
    gatewayToken: options.gatewayToken,
    gatewayPassword: options.gatewayPassword,
    taskTimeoutMs: Number(process.env.TASK_TIMEOUT_MS) || 120_000
  });
  const metrics = new Registry();
  metrics.setDefaultLabels({ service: "openclaw-adapter" });
  const executions = new Counter({
    name: "clawwork_adapter_executions_total",
    help: "Gateway execution requests",
    labelNames: ["outcome"] as const,
    registers: [metrics]
  });
  const streams = new Gauge({
    name: "clawwork_adapter_sse_streams",
    help: "Active adapter SSE streams",
    registers: [metrics]
  });

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "GET" && requestUrl.pathname === "/health/live") {
      writeJson(response, 200, { status: "ok", service: "openclaw-adapter" });
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === "/metrics") {
      response.statusCode = 200;
      response.setHeader("Content-Type", metrics.contentType);
      response.end(await metrics.metrics());
      return;
    }

    if (
      options.internalToken &&
      (requestUrl.pathname.startsWith("/gateway/tasks/")) &&
      request.headers.authorization !== `Bearer ${options.internalToken}`
    ) {
      writeJson(response, 401, { code: "UNAUTHORIZED", message: "unauthorized" });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/gateway/tasks/execute") {
      try {
        const payload = await readJsonBody<ExecuteTaskPayload>(request);
        validateExecutePayload(payload, options.allowedContentOrigin);
        const accepted = await gateway.execute(
          {
            taskId: payload.taskId,
            sessionId: payload.sessionId,
            message: payload.message,
            files: payload.files ?? []
          },
          {
            onEvent: (event) => broker.publish(payload.taskId, event)
          }
        );

        writeJson(response, 202, {
          ...accepted,
          streamUrl: `/gateway/tasks/${payload.taskId}/events`
        });
        executions.inc({ outcome: "accepted" });
      } catch (error) {
        const typedError =
          error instanceof Error && "code" in error
            ? (error as Error & { code: string })
            : undefined;
        const statusCode =
          typedError?.code === "PAYLOAD_TOO_LARGE"
            ? 413
            : typedError?.code === "INVALID_INPUT" ||
                typedError?.code === "INVALID_FILE_ORIGIN"
              ? 400
              : 502;
        writeJson(response, statusCode, {
          code: typedError?.code ?? "GATEWAY_UNAVAILABLE",
          message: error instanceof Error ? error.message : "gateway request failed"
        });
        executions.inc({ outcome: "failed" });
      }
      return;
    }

    const cancelTaskMatch = requestUrl.pathname.match(/^\/gateway\/tasks\/([^/]+)\/cancel$/);
    if (request.method === "POST" && cancelTaskMatch) {
      const taskId = decodeURIComponent(cancelTaskMatch[1] ?? "");
      try {
        const cancelled = gateway.cancel(taskId);
        if (!cancelled) {
          writeJson(response, 404, { code: "TASK_NOT_ACTIVE", message: "task is not active" });
        } else {
          writeJson(response, 202, cancelled);
        }
      } catch (error) {
        writeJson(response, 502, {
          code: error instanceof Error && "code" in error ? error.code : "GATEWAY_UNAVAILABLE",
          message: error instanceof Error ? error.message : "gateway cancellation failed"
        });
      }
      return;
    }

    const taskEventsMatch = requestUrl.pathname.match(/^\/gateway\/tasks\/([^/]+)\/events$/);
    if (request.method === "GET" && taskEventsMatch) {
      const taskId = decodeURIComponent(taskEventsMatch[1] ?? "");
      const lastEventId = Number(request.headers["last-event-id"] ?? 0);
      const replayAfter = Number.isSafeInteger(lastEventId) && lastEventId > 0 ? lastEventId : 0;
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      });
      streams.inc();
      let streamClosed = false;
      const closeStream = () => {
        if (!streamClosed) {
          streamClosed = true;
          streams.dec();
        }
      };

      const replay = broker.replay(taskId, replayAfter);
      for (const item of replay) {
        writeSseEvent(response, item);
      }

      const lastReplayEvent = replay.at(-1)?.event;
      if (lastReplayEvent && isTerminalEvent(lastReplayEvent)) {
        closeStream();
        response.end();
        return;
      }

      const unsubscribe = broker.subscribe(taskId, (item) => {
        writeSseEvent(response, item);
        if (isTerminalEvent(item.event)) {
          unsubscribe();
          closeStream();
          response.end();
        }
      });

      request.on("close", () => {
        unsubscribe();
        closeStream();
      });
      return;
    }

    writeJson(response, 404, { message: "not found" });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(options.port ?? 0, options.host ?? "127.0.0.1", () => resolve());
    server.on("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("adapter server address unavailable");
  }

  return {
    url: `http://${options.host ?? "127.0.0.1"}:${address.port}`,
    close: async () => {
      await gateway.close();
      broker.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}
