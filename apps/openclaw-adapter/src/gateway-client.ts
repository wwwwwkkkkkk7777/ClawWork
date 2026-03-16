import type { GatewayFrame, GatewayRequest } from "@clawwork/openclaw-protocol";
import type { TaskStreamEvent } from "@clawwork/shared-types";
import WebSocket from "ws";
import { mapGatewayError } from "./error-map";

type ExecuteGatewayTaskInput = {
  gatewayUrl: string;
  taskId: string;
  sessionId: string;
  message: string;
  gatewayToken?: string;
  gatewayPassword?: string;
};

type ExecuteGatewayTaskHandlers = {
  onEvent: (event: TaskStreamEvent) => void;
};

const GATEWAY_PROTOCOL_VERSION = 3;

function nowIsoString() {
  return new Date().toISOString();
}

export async function executeGatewayTask(
  input: ExecuteGatewayTaskInput,
  handlers: ExecuteGatewayTaskHandlers
) {
  return await new Promise<{
    taskId: string;
    sessionId: string;
    runId: string;
    sessionKey: string;
  }>((resolve, reject) => {
    const ws = new WebSocket(input.gatewayUrl);
    let sessionKey = "main";
    let resolvedRunId = "";
    let hasResolved = false;

    const cleanup = () => {
      ws.removeAllListeners();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };

    ws.on("message", (raw) => {
      const frame = JSON.parse(raw.toString()) as GatewayFrame;

      if (frame.type === "event" && frame.event === "connect.challenge") {
        const connectRequest: GatewayRequest = {
          type: "req",
          id: "connect-1",
          method: "connect",
          params: {
            minProtocol: GATEWAY_PROTOCOL_VERSION,
            maxProtocol: GATEWAY_PROTOCOL_VERSION,
            role: "operator",
            scopes: [],
            caps: [],
            locale: "en-US",
            client: {
              id: "clawwork-mobile-api",
              displayName: "ClawWork Adapter",
              version: "0.1.0",
              platform: "node",
              mode: "operator",
              instanceId: "clawwork-adapter"
            },
            ...(input.gatewayToken
              ? { auth: { token: input.gatewayToken } }
              : input.gatewayPassword
                ? { auth: { password: input.gatewayPassword } }
                : {})
          }
        };
        const taskRequest: GatewayRequest = {
          type: "req",
          id: input.taskId,
          method: "chat.send",
          params: {
            sessionKey,
            message: input.message,
            thinking: "default",
            idempotencyKey: input.taskId,
            timeoutMs: 30000
          }
        };

        ws.send(JSON.stringify(connectRequest));
        return;
      }

      if (frame.type === "res" && frame.id === "connect-1" && frame.ok) {
        sessionKey = frame.payload.snapshot?.sessionDefaults?.mainSessionKey ?? "main";
        const taskRequest: GatewayRequest = {
          type: "req",
          id: input.taskId,
          method: "chat.send",
          params: {
            sessionKey,
            message: input.message,
            thinking: "default",
            idempotencyKey: input.taskId,
            timeoutMs: 30000
          }
        };

        ws.send(JSON.stringify(taskRequest));
        return;
      }

      if (frame.type === "res" && frame.id === input.taskId && frame.ok) {
        resolvedRunId = frame.payload.runId ?? "";
        const acceptedEvent: TaskStreamEvent = {
          type: "task.accepted",
          taskId: input.taskId,
          sessionId: input.sessionId,
          runId: resolvedRunId,
          timestamp: nowIsoString()
        };

        handlers.onEvent(acceptedEvent);

        hasResolved = true;
        resolve({
          taskId: input.taskId,
          sessionId: input.sessionId,
          runId: resolvedRunId,
          sessionKey
        });
        return;
      }

      if (frame.type === "res" && frame.id === input.taskId && !frame.ok) {
        cleanup();
        const mapped = mapGatewayError(frame.error?.code ?? "UNKNOWN");
        reject(new Error(mapped.code));
        return;
      }

      if (frame.type === "event" && frame.event === "agent") {
        const runId = frame.payload.runId ?? resolvedRunId;
        if (frame.payload.stream === "assistant") {
          const delta = String(frame.payload.data?.text ?? "");
          if (delta) {
            handlers.onEvent({
              type: "task.delta",
              taskId: input.taskId,
              sessionId: input.sessionId,
              runId,
              timestamp: nowIsoString(),
              delta
            });
          }
          return;
        }

        handlers.onEvent({
          type: "task.stage.changed",
          taskId: input.taskId,
          sessionId: input.sessionId,
          runId,
          timestamp: nowIsoString(),
          stage: frame.payload.stream ?? "agent"
        });
        return;
      }

      if (frame.type === "event" && frame.event === "chat") {
        const runId = frame.payload.runId ?? resolvedRunId;
        const state = frame.payload.state ?? "unknown";

        if (state === "error") {
          handlers.onEvent({
            type: "task.failed",
            taskId: input.taskId,
            sessionId: input.sessionId,
            runId,
            timestamp: nowIsoString(),
            code: "GATEWAY_ERROR",
            message: frame.payload.errorMessage ?? "gateway task failed"
          });
          cleanup();
          return;
        }

        if (state === "final" || state === "aborted") {
          handlers.onEvent({
            type: "task.completed",
            taskId: input.taskId,
            sessionId: input.sessionId,
            runId,
            timestamp: nowIsoString()
          });
          cleanup();
        }
      }
    });

    ws.on("error", (error) => {
      cleanup();
      if (!hasResolved) {
        reject(error);
        return;
      }

      handlers.onEvent({
        type: "task.failed",
        taskId: input.taskId,
        sessionId: input.sessionId,
        runId: resolvedRunId || input.taskId,
        timestamp: nowIsoString(),
        code: "GATEWAY_UNAVAILABLE",
        message: error.message
      });
    });
  });
}

export async function sendTaskToGateway(url: string, input: { requestId: string; message: string }) {
  return executeGatewayTask(
    {
      gatewayUrl: url,
      taskId: input.requestId,
      sessionId: "session-1",
      message: input.message
    },
    {
      onEvent: () => {
        // Existing low-level test only verifies accepted metadata.
      }
    }
  ).then((result) => ({ runId: result.runId }));
}
