import type { GatewayFrame, GatewayRequest } from "@clawwork/openclaw-protocol";
import type { TaskStreamEvent } from "@clawwork/shared-types";
import WebSocket from "ws";
import {
  executeGatewayTask,
  extractArtifactResult,
  normalizeAssistantDelta,
  type ExecuteGatewayTaskHandlers,
  type ExecuteGatewayTaskInput
} from "./gateway-client";
import { prepareGatewayInput, type GatewayAttachment } from "./gateway-input";

type ClientOptions = {
  gatewayUrl: string;
  gatewayToken?: string;
  gatewayPassword?: string;
  connectTimeoutMs?: number;
  taskTimeoutMs?: number;
  reconnectDelayMs?: number;
};

type ActiveTask = {
  input: ExecuteGatewayTaskInput;
  handlers: ExecuteGatewayTaskHandlers;
  sessionKey: string;
  runId: string;
  lastAssistantSnapshot: string;
  settled: boolean;
  resolve: (value: {
    taskId: string;
    sessionId: string;
    runId: string;
    sessionKey: string;
  }) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type TaskEventDetail =
  | { type: "task.accepted" }
  | { type: "task.stage.changed"; stage: string }
  | { type: "task.delta"; delta: string }
  | {
      type: "task.result.created";
      result: Extract<TaskStreamEvent, { type: "task.result.created" }>["result"];
    }
  | { type: "task.completed" }
  | { type: "task.cancelled"; message: string }
  | { type: "task.failed"; code: string; message: string };

const CONNECT_REQUEST_ID = "persistent-connect";
const PROTOCOL_VERSION = 3;

function asString(input: unknown) {
  return typeof input === "string" ? input.trim() : "";
}

function now() {
  return new Date().toISOString();
}

function gatewayError(code: string, message: string) {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function sessionKeyFor(sessionId: string, agentId: string) {
  return `agent:${agentId}:session:${sessionId.trim().toLowerCase()}`;
}

export class PersistentGatewayClient {
  private socket: WebSocket | undefined;
  private connectionPromise: Promise<void> | undefined;
  private resolveConnection: (() => void) | undefined;
  private rejectConnection: ((error: Error) => void) | undefined;
  private connectTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private connected = false;
  private closed = false;
  private lastPong = true;
  private readonly activeByTask = new Map<string, ActiveTask>();
  private readonly taskByRun = new Map<string, ActiveTask>();
  private readonly fallbackByTask = new Map<string, {
    cancel: () => void;
    close: () => void;
    sessionId: string;
    runId: string;
  }>();

  constructor(private readonly options: ClientOptions) {}

  async execute(
    input: Omit<ExecuteGatewayTaskInput, "gatewayUrl" | "gatewayToken" | "gatewayPassword">,
    handlers: ExecuteGatewayTaskHandlers
  ) {
    const fullInput: ExecuteGatewayTaskInput = {
      ...input,
      gatewayUrl: this.options.gatewayUrl,
      gatewayToken: this.options.gatewayToken,
      gatewayPassword: this.options.gatewayPassword,
      taskTimeoutMs: this.options.taskTimeoutMs
    };

    try {
      return await this.executePersistent(fullInput, handlers);
    } catch (error) {
      if (this.closed) {
        throw error;
      }
      let accepted = false;
      try {
        const result = await executeGatewayTask(fullInput, {
          onControl: ({ cancel, close }) => {
            this.fallbackByTask.set(input.taskId, {
              cancel,
              close,
              sessionId: input.sessionId,
              runId: input.taskId
            });
          },
          onEvent: (event) => {
            const fallback = this.fallbackByTask.get(input.taskId);
            if (fallback && event.type === "task.accepted") fallback.runId = event.runId;
            handlers.onEvent(event);
            if (
              event.type === "task.completed" ||
              event.type === "task.failed" ||
              event.type === "task.cancelled"
            ) {
              this.fallbackByTask.delete(input.taskId);
            }
          }
        });
        accepted = true;
        return result;
      } finally {
        if (!accepted) this.fallbackByTask.delete(input.taskId);
      }
    }
  }

  async close() {
    this.closed = true;
    this.connected = false;
    if (this.connectTimer) clearTimeout(this.connectTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.failAll(gatewayError("GATEWAY_SHUTDOWN", "gateway client is shutting down"));
    for (const fallback of this.fallbackByTask.values()) fallback.close();
    this.fallbackByTask.clear();
    const socket = this.socket;
    this.socket = undefined;
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      return;
    }
    await new Promise<void>((resolve) => {
      socket.once("close", () => resolve());
      socket.close(1000, "adapter shutdown");
      setTimeout(resolve, 1_000);
    });
  }

  cancel(taskId: string) {
    const active = this.activeByTask.get(taskId);
    if (!active) {
      const fallback = this.fallbackByTask.get(taskId);
      if (!fallback) return null;
      fallback.cancel();
      this.fallbackByTask.delete(taskId);
      return {
        taskId,
        sessionId: fallback.sessionId,
        runId: fallback.runId
      };
    }
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw gatewayError("GATEWAY_UNAVAILABLE", "gateway connection is unavailable");
    }
    this.socket.send(
      JSON.stringify({
        type: "req",
        id: `abort:${taskId}`,
        method: "chat.abort",
        params: {
          sessionKey: active.sessionKey,
          ...(active.runId ? { runId: active.runId } : {})
        }
      } satisfies GatewayRequest)
    );
    active.handlers.onEvent(
      this.event(active, { type: "task.cancelled", message: "task cancelled by user" })
    );
    const result = {
      taskId,
      sessionId: active.input.sessionId,
      runId: active.runId || taskId
    };
    if (!active.settled) {
      active.settled = true;
      active.reject(gatewayError("TASK_CANCELLED", "task cancelled by user"));
    }
    this.removeTask(active);
    return result;
  }

  private async executePersistent(
    input: ExecuteGatewayTaskInput,
    handlers: ExecuteGatewayTaskHandlers
  ) {
    const prepared = await prepareGatewayInput(input.message, input.files);
    await this.ensureConnected();
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw gatewayError("GATEWAY_UNAVAILABLE", "gateway connection is unavailable");
    }

    const agentId = asString(process.env.OPENCLAW_GATEWAY_AGENT_ID) || "main";
    const sessionKey = sessionKeyFor(input.sessionId, agentId);

    return new Promise<{
      taskId: string;
      sessionId: string;
      runId: string;
      sessionKey: string;
    }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const active = this.activeByTask.get(input.taskId);
        if (!active) return;
        const error = gatewayError("TASK_TIMEOUT", "gateway task timed out");
        if (!active.settled) {
          active.settled = true;
          active.reject(error);
        } else {
          this.emitFailure(active, error);
        }
        this.removeTask(active);
      }, this.options.taskTimeoutMs ?? 120_000);

      const active: ActiveTask = {
        input,
        handlers,
        sessionKey,
        runId: "",
        lastAssistantSnapshot: "",
        settled: false,
        resolve,
        reject,
        timeout
      };
      this.activeByTask.set(input.taskId, active);
      this.socket?.send(
        JSON.stringify(this.buildChatRequest(input.taskId, sessionKey, prepared.message, prepared.attachments))
      );
    });
  }

  private ensureConnected() {
    if (this.connected && this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise<void>((resolve, reject) => {
      this.resolveConnection = resolve;
      this.rejectConnection = reject;
    });
    const socket = new WebSocket(this.options.gatewayUrl);
    this.socket = socket;
    this.connectTimer = setTimeout(() => {
      this.rejectCurrentConnection(
        gatewayError("GATEWAY_TIMEOUT", "gateway connect timed out")
      );
      socket.terminate();
    }, this.options.connectTimeoutMs ?? 12_000);

    socket.on("message", (raw) => this.handleMessage(raw.toString()));
    socket.on("pong", () => {
      this.lastPong = true;
    });
    socket.on("error", (error) => {
      if (!this.connected) {
        this.rejectCurrentConnection(
          gatewayError("GATEWAY_UNAVAILABLE", error.message || "gateway connection failed")
        );
      }
    });
    socket.on("close", (code, reason) => {
      const detail = reason.toString().trim();
      this.handleDisconnect(
        gatewayError(
          "GATEWAY_UNAVAILABLE",
          detail ? `gateway closed (${code}): ${detail}` : `gateway closed (${code})`
        )
      );
    });
    return this.connectionPromise;
  }

  private handleMessage(raw: string) {
    let frame: GatewayFrame;
    try {
      frame = JSON.parse(raw) as GatewayFrame;
    } catch {
      this.handleDisconnect(gatewayError("GATEWAY_PROTOCOL_ERROR", "invalid gateway frame"));
      this.socket?.terminate();
      return;
    }

    if (frame.type === "event" && frame.event === "connect.challenge") {
      this.socket?.send(JSON.stringify(this.buildConnectRequest()));
      return;
    }
    if (frame.type === "res" && frame.id === CONNECT_REQUEST_ID) {
      if (!frame.ok) {
        this.rejectCurrentConnection(
          gatewayError(frame.error?.code ?? "GATEWAY_AUTH_ERROR", frame.error?.message ?? "gateway rejected connect")
        );
        this.socket?.close();
        return;
      }
      this.connected = true;
      if (this.connectTimer) clearTimeout(this.connectTimer);
      this.resolveConnection?.();
      this.clearConnectionPromise();
      this.startHeartbeat();
      return;
    }

    if (frame.type === "res") {
      const active = this.activeByTask.get(frame.id);
      if (!active) return;
      if (!frame.ok) {
        const error = gatewayError(
          frame.error?.code ?? "GATEWAY_ERROR",
          frame.error?.message ?? "gateway task rejected"
        );
        active.settled = true;
        active.reject(error);
        this.removeTask(active);
        return;
      }
      active.runId = asString(frame.payload.runId) || active.input.taskId;
      this.taskByRun.set(active.runId, active);
      active.handlers.onEvent(this.event(active, { type: "task.accepted" }));
      active.settled = true;
      active.resolve({
        taskId: active.input.taskId,
        sessionId: active.input.sessionId,
        runId: active.runId,
        sessionKey: active.sessionKey
      });
      return;
    }

    if (frame.type !== "event" || (frame.event !== "agent" && frame.event !== "chat")) {
      return;
    }
    const active = this.findActive(frame.payload.runId, frame.payload.sessionKey);
    if (!active) return;

    const artifact = extractArtifactResult(frame.payload.data, frame.payload.message);
    if (artifact) {
      active.handlers.onEvent(
        this.event(active, { type: "task.result.created", result: artifact })
      );
    }

    if (frame.event === "agent") {
      if (frame.payload.stream === "assistant") {
        const snapshot = String(frame.payload.data?.text ?? "");
        const normalized = normalizeAssistantDelta(snapshot, active.lastAssistantSnapshot);
        active.lastAssistantSnapshot = normalized.nextSnapshot;
        if (normalized.nextDelta) {
          active.handlers.onEvent(
            this.event(active, { type: "task.delta", delta: normalized.nextDelta })
          );
        }
      } else if (!artifact) {
        active.handlers.onEvent(
          this.event(active, {
            type: "task.stage.changed",
            stage: frame.payload.stream ?? "agent"
          })
        );
      }
      return;
    }

    if (frame.payload.state === "error") {
      this.emitFailure(
        active,
        gatewayError("GATEWAY_ERROR", frame.payload.errorMessage ?? "gateway task failed")
      );
      this.removeTask(active);
      return;
    }
    if (frame.payload.state === "aborted") {
      this.emitFailure(
        active,
        gatewayError("GATEWAY_ABORTED", "gateway task was aborted")
      );
      this.removeTask(active);
      return;
    }
    if (frame.payload.state === "final") {
      active.handlers.onEvent(this.event(active, { type: "task.completed" }));
      this.removeTask(active);
    }
  }

  private findActive(runId?: string, sessionKey?: string) {
    if (runId && this.taskByRun.has(runId)) {
      return this.taskByRun.get(runId);
    }
    if (sessionKey) {
      return [...this.activeByTask.values()].find((item) => item.sessionKey === sessionKey);
    }
    return this.activeByTask.size === 1 ? [...this.activeByTask.values()][0] : undefined;
  }

  private event(active: ActiveTask, detail: TaskEventDetail): TaskStreamEvent {
    return {
      ...detail,
      taskId: active.input.taskId,
      sessionId: active.input.sessionId,
      runId: active.runId || active.input.taskId,
      timestamp: now()
    } as TaskStreamEvent;
  }

  private emitFailure(active: ActiveTask, error: Error & { code?: string }) {
    active.handlers.onEvent(
      this.event(active, {
        type: "task.failed",
        code: error.code ?? "GATEWAY_ERROR",
        message: error.message
      })
    );
  }

  private removeTask(active: ActiveTask) {
    clearTimeout(active.timeout);
    this.activeByTask.delete(active.input.taskId);
    if (active.runId) this.taskByRun.delete(active.runId);
  }

  private failAll(error: Error & { code?: string }) {
    for (const active of this.activeByTask.values()) {
      if (!active.settled) {
        active.settled = true;
        active.reject(error);
      } else {
        this.emitFailure(active, error);
      }
      clearTimeout(active.timeout);
    }
    this.activeByTask.clear();
    this.taskByRun.clear();
  }

  private handleDisconnect(error: Error & { code?: string }) {
    const wasConnected = this.connected;
    this.connected = false;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.rejectCurrentConnection(error);
    if (wasConnected) this.failAll(error);
    if (!this.closed && !this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = undefined;
        void this.ensureConnected().catch(() => undefined);
      }, this.options.reconnectDelayMs ?? 1_000);
    }
  }

  private rejectCurrentConnection(error: Error) {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.rejectConnection?.(error);
    this.clearConnectionPromise();
  }

  private clearConnectionPromise() {
    this.connectionPromise = undefined;
    this.resolveConnection = undefined;
    this.rejectConnection = undefined;
  }

  private startHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.lastPong = true;
    this.heartbeat = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
      if (!this.lastPong) {
        this.socket.terminate();
        return;
      }
      this.lastPong = false;
      this.socket.ping();
    }, 20_000);
  }

  private buildConnectRequest(): GatewayRequest {
    const token = asString(this.options.gatewayToken);
    const password = asString(this.options.gatewayPassword);
    return {
      type: "req",
      id: CONNECT_REQUEST_ID,
      method: "connect",
      params: {
        minProtocol: PROTOCOL_VERSION,
        maxProtocol: PROTOCOL_VERSION,
        role: "operator",
        scopes: ["operator.read", "operator.write", "operator.talk.secrets"],
        caps: [],
        commands: [],
        permissions: {},
        locale: "en-US",
        userAgent: "ClawWorkAdapter/0.2.0 (Node.js)",
        client: {
          id: asString(process.env.OPENCLAW_GATEWAY_CLIENT_ID) || "openclaw-android",
          displayName: "ClawWork Adapter",
          version: "0.2.0",
          platform: asString(process.env.OPENCLAW_GATEWAY_CLIENT_PLATFORM) || "android",
          mode: asString(process.env.OPENCLAW_GATEWAY_CLIENT_MODE) || "ui",
          instanceId: asString(process.env.OPENCLAW_GATEWAY_CLIENT_INSTANCE_ID) || "clawwork-adapter",
          deviceFamily: "Desktop"
        },
        ...(token ? { auth: { token } } : password ? { auth: { password } } : {})
      }
    };
  }

  private buildChatRequest(
    taskId: string,
    sessionKey: string,
    message: string,
    attachments: GatewayAttachment[]
  ): GatewayRequest {
    return {
      type: "req",
      id: taskId,
      method: "chat.send",
      params: {
        sessionKey,
        message,
        ...(attachments.length ? { attachments } : {}),
        thinking: "default",
        idempotencyKey: taskId,
        timeoutMs: this.options.taskTimeoutMs ?? 120_000
      }
    };
  }
}
