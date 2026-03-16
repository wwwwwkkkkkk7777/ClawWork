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

type GatewayExecutionError = Error & {
  code: string;
  retryable: boolean;
};

type ChatCompletionResponse = {
  id?: string;
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: string;
  };
};

const GATEWAY_PROTOCOL_VERSION = 3;
const CONNECT_REQUEST_ID = "connect-1";
const DEFAULT_CONNECT_TIMEOUT_MS = 12_000;
const DEFAULT_TASK_TIMEOUT_MS = 30_000;
const DEFAULT_SESSION_KEY = "main";
const DEFAULT_AGENT_ID = "main";
const DEFAULT_OPERATOR_SCOPES = [
  "operator.read",
  "operator.write",
  "operator.talk.secrets"
];
const DEFAULT_CLIENT_ID = asNonEmptyString(process.env.OPENCLAW_GATEWAY_CLIENT_ID) || "openclaw-android";
const DEFAULT_CLIENT_MODE = asNonEmptyString(process.env.OPENCLAW_GATEWAY_CLIENT_MODE) || "ui";
const DEFAULT_CLIENT_PLATFORM =
  asNonEmptyString(process.env.OPENCLAW_GATEWAY_CLIENT_PLATFORM) || "android";
const DEFAULT_CLIENT_DISPLAY_NAME =
  asNonEmptyString(process.env.OPENCLAW_GATEWAY_CLIENT_DISPLAY_NAME) || "ClawWork Adapter";
const DEFAULT_CLIENT_INSTANCE_ID =
  asNonEmptyString(process.env.OPENCLAW_GATEWAY_CLIENT_INSTANCE_ID) || "clawwork-adapter";
const DEFAULT_CLIENT_DEVICE_FAMILY =
  asNonEmptyString(process.env.OPENCLAW_GATEWAY_CLIENT_DEVICE_FAMILY) || "Desktop";

function nowIsoString() {
  return new Date().toISOString();
}

function asNonEmptyString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function extractContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }

      const part = item as {
        type?: unknown;
        text?: unknown;
        input_text?: unknown;
      };

      if (part.type === "text" && typeof part.text === "string") {
        return part.text;
      }

      if (part.type === "input_text" && typeof part.input_text === "string") {
        return part.input_text;
      }

      if (typeof part.input_text === "string") {
        return part.input_text;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function toGatewayExecutionError(rawCode: string, fallbackMessage: string): GatewayExecutionError {
  const mapped = mapGatewayError(rawCode);
  const error = new Error(fallbackMessage) as GatewayExecutionError;
  error.code = mapped.code;
  error.retryable = mapped.retryable;
  return error;
}

function combineGatewayErrors(
  wsError: GatewayExecutionError,
  httpError: GatewayExecutionError
): GatewayExecutionError {
  const combinedMessage =
    httpError.message === wsError.message
      ? httpError.message
      : `${wsError.message} (HTTP fallback: ${httpError.message})`;

  const combined = new Error(combinedMessage) as GatewayExecutionError;
  combined.code = httpError.code;
  combined.retryable = httpError.retryable;
  return combined;
}

function buildConnectRequest(input: ExecuteGatewayTaskInput): GatewayRequest {
  const authToken = asNonEmptyString(input.gatewayToken);
  const authPassword = asNonEmptyString(input.gatewayPassword);

  return {
    type: "req",
    id: CONNECT_REQUEST_ID,
    method: "connect",
    params: {
      minProtocol: GATEWAY_PROTOCOL_VERSION,
      maxProtocol: GATEWAY_PROTOCOL_VERSION,
      role: "operator",
      scopes: DEFAULT_OPERATOR_SCOPES,
      caps: [],
      commands: [],
      permissions: {},
      locale: "en-US",
      userAgent: "ClawWorkAdapter/0.1.0 (Node.js)",
      client: {
        id: DEFAULT_CLIENT_ID,
        displayName: DEFAULT_CLIENT_DISPLAY_NAME,
        version: "0.1.0",
        platform: DEFAULT_CLIENT_PLATFORM,
        mode: DEFAULT_CLIENT_MODE,
        instanceId: DEFAULT_CLIENT_INSTANCE_ID,
        deviceFamily: DEFAULT_CLIENT_DEVICE_FAMILY
      },
      ...(authToken
        ? { auth: { token: authToken } }
        : authPassword
          ? { auth: { password: authPassword } }
          : {})
    }
  };
}

function buildChatRequest(taskId: string, sessionKey: string, message: string): GatewayRequest {
  return {
    type: "req",
    id: taskId,
    method: "chat.send",
    params: {
      sessionKey,
      message,
      thinking: "default",
      idempotencyKey: taskId,
      timeoutMs: DEFAULT_TASK_TIMEOUT_MS
    }
  };
}

function emitAcceptedEvent(
  handlers: ExecuteGatewayTaskHandlers,
  input: ExecuteGatewayTaskInput,
  runId: string
) {
  handlers.onEvent({
    type: "task.accepted",
    taskId: input.taskId,
    sessionId: input.sessionId,
    runId,
    timestamp: nowIsoString()
  });
}

function normalizeAssistantDelta(nextSnapshot: string, previousSnapshot: string) {
  if (!nextSnapshot) {
    return {
      nextDelta: "",
      nextSnapshot
    };
  }

  if (previousSnapshot && nextSnapshot.startsWith(previousSnapshot)) {
    return {
      nextDelta: nextSnapshot.slice(previousSnapshot.length),
      nextSnapshot
    };
  }

  return {
    nextDelta: nextSnapshot,
    nextSnapshot
  };
}

function toHttpGatewayUrl(gatewayUrl: string) {
  const url = new URL(gatewayUrl);

  if (url.protocol === "ws:") {
    url.protocol = "http:";
  } else if (url.protocol === "wss:") {
    url.protocol = "https:";
  } else if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw toGatewayExecutionError("INVALID_REQUEST", "invalid gateway url protocol");
  }

  url.pathname = "/v1/chat/completions";
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function executeGatewayTaskViaHttp(
  input: ExecuteGatewayTaskInput,
  handlers: ExecuteGatewayTaskHandlers,
  sessionKey: string
) {
  const agentId = asNonEmptyString(process.env.OPENCLAW_GATEWAY_AGENT_ID) || DEFAULT_AGENT_ID;
  const authSecret =
    asNonEmptyString(input.gatewayToken) || asNonEmptyString(input.gatewayPassword);
  const headers = new Headers({
    "Content-Type": "application/json",
    "x-openclaw-agent-id": agentId,
    "x-openclaw-session-key": sessionKey
  });

  if (authSecret) {
    headers.set("Authorization", `Bearer ${authSecret}`);
  }

  const response = await fetch(toHttpGatewayUrl(input.gatewayUrl), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "openclaw",
      stream: false,
      messages: [{ role: "user", content: input.message }]
    })
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | ChatCompletionResponse
      | null;
    const message = asNonEmptyString(payload?.error?.message);

    if (response.status === 401) {
      throw toGatewayExecutionError(
        "AUTH_REQUIRED",
        message || "gateway token/password invalid"
      );
    }

    if (response.status === 404) {
      throw toGatewayExecutionError(
        "HTTP_CHAT_COMPLETIONS_DISABLED",
        message ||
          "OpenClaw HTTP chat completions endpoint is disabled. Enable gateway.http.endpoints.chatCompletions.enabled."
      );
    }

    if (response.status >= 500) {
      throw toGatewayExecutionError(
        "UNAVAILABLE",
        message || "gateway http chat completions request failed"
      );
    }

    throw toGatewayExecutionError(
      "GATEWAY_ERROR",
      message || `gateway http fallback failed: ${response.status}`
    );
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  const reply = extractContent(payload.choices?.[0]?.message?.content);

  if (!reply) {
    throw toGatewayExecutionError("EMPTY_RESPONSE", "gateway returned an empty reply");
  }

  const runId = asNonEmptyString(payload.id) || `http-${input.taskId}`;
  emitAcceptedEvent(handlers, input, runId);
  handlers.onEvent({
    type: "task.delta",
    taskId: input.taskId,
    sessionId: input.sessionId,
    runId,
    timestamp: nowIsoString(),
    delta: reply
  });
  handlers.onEvent({
    type: "task.completed",
    taskId: input.taskId,
    sessionId: input.sessionId,
    runId,
    timestamp: nowIsoString()
  });

  return {
    taskId: input.taskId,
    sessionId: input.sessionId,
    runId,
    sessionKey
  };
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
    let sessionKey = DEFAULT_SESSION_KEY;
    let resolvedRunId = "";
    let lastAssistantSnapshot = "";
    let promiseSettled = false;
    let fallbackInFlight = false;

    const connectTimer = setTimeout(() => {
      failBeforeAccepted(
        toGatewayExecutionError("AGENT_TIMEOUT", "gateway connect timed out")
      );
    }, DEFAULT_CONNECT_TIMEOUT_MS);

    const clearConnectTimer = () => {
      clearTimeout(connectTimer);
    };

    const cleanup = () => {
      clearConnectTimer();
      ws.removeAllListeners();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };

    const resolveAccepted = (result: {
      taskId: string;
      sessionId: string;
      runId: string;
      sessionKey: string;
    }) => {
      if (promiseSettled) {
        return;
      }

      promiseSettled = true;
      clearConnectTimer();
      resolve(result);
    };

    const rejectExecution = (error: GatewayExecutionError) => {
      if (promiseSettled) {
        return;
      }

      promiseSettled = true;
      cleanup();
      reject(error);
    };

    const failAfterAccepted = (error: GatewayExecutionError) => {
      handlers.onEvent({
        type: "task.failed",
        taskId: input.taskId,
        sessionId: input.sessionId,
        runId: resolvedRunId || input.taskId,
        timestamp: nowIsoString(),
        code: error.code,
        message: error.message
      });
      cleanup();
    };

    const failBeforeAccepted = (error: GatewayExecutionError) => {
      if (promiseSettled) {
        failAfterAccepted(error);
        return;
      }

      if (fallbackInFlight) {
        return;
      }

      fallbackInFlight = true;
      cleanup();

      void executeGatewayTaskViaHttp(input, handlers, sessionKey)
        .then((result) => {
          if (promiseSettled) {
            return;
          }

          promiseSettled = true;
          resolve(result);
        })
        .catch((httpError) => {
          const typedHttpError =
            httpError instanceof Error && "code" in httpError
              ? (httpError as GatewayExecutionError)
              : toGatewayExecutionError(
                  "UNAVAILABLE",
                  httpError instanceof Error ? httpError.message : "gateway fallback failed"
                );
          rejectExecution(combineGatewayErrors(error, typedHttpError));
        });
    };

    ws.on("message", (raw) => {
      const frame = JSON.parse(raw.toString()) as GatewayFrame;

      if (frame.type === "event" && frame.event === "connect.challenge") {
        ws.send(JSON.stringify(buildConnectRequest(input)));
        return;
      }

      if (frame.type === "res" && frame.id === CONNECT_REQUEST_ID && frame.ok) {
        sessionKey = frame.payload.snapshot?.sessionDefaults?.mainSessionKey ?? DEFAULT_SESSION_KEY;
        ws.send(JSON.stringify(buildChatRequest(input.taskId, sessionKey, input.message)));
        return;
      }

      if (frame.type === "res" && frame.id === CONNECT_REQUEST_ID && !frame.ok) {
        failBeforeAccepted(
          toGatewayExecutionError(
            frame.error?.code ?? "UNKNOWN",
            frame.error?.message ?? "gateway connect rejected"
          )
        );
        return;
      }

      if (frame.type === "res" && frame.id === input.taskId && frame.ok) {
        resolvedRunId = asNonEmptyString(frame.payload.runId) || input.taskId;
        emitAcceptedEvent(handlers, input, resolvedRunId);
        resolveAccepted({
          taskId: input.taskId,
          sessionId: input.sessionId,
          runId: resolvedRunId,
          sessionKey
        });
        return;
      }

      if (frame.type === "res" && frame.id === input.taskId && !frame.ok) {
        const error = toGatewayExecutionError(
          frame.error?.code ?? "UNKNOWN",
          frame.error?.message ?? "gateway task rejected"
        );
        if (!promiseSettled) {
          rejectExecution(error);
          return;
        }

        failAfterAccepted(error);
        return;
      }

      if (frame.type === "event" && frame.event === "agent") {
        const runId = frame.payload.runId ?? resolvedRunId;
        if (frame.payload.stream === "assistant") {
          const nextSnapshot = String(frame.payload.data?.text ?? "");
          const { nextDelta, nextSnapshot: normalizedSnapshot } = normalizeAssistantDelta(
            nextSnapshot,
            lastAssistantSnapshot
          );
          lastAssistantSnapshot = normalizedSnapshot;
          const delta = nextDelta;
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
          failAfterAccepted(
            toGatewayExecutionError(
              "GATEWAY_ERROR",
              frame.payload.errorMessage ?? "gateway task failed"
            )
          );
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
      const typedError = toGatewayExecutionError(
        "UNAVAILABLE",
        error.message || "gateway websocket request failed"
      );

      if (!promiseSettled) {
        failBeforeAccepted(typedError);
        return;
      }

      failAfterAccepted(typedError);
    });

    ws.on("close", (code, reason) => {
      const detail = reason.toString().trim();
      const message = detail
        ? `gateway connection closed (${code}): ${detail}`
        : `gateway connection closed (${code})`;
      const typedError = toGatewayExecutionError("UNAVAILABLE", message);

      if (!promiseSettled) {
        failBeforeAccepted(typedError);
        return;
      }

      if (code !== 1000) {
        failAfterAccepted(typedError);
      }
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
