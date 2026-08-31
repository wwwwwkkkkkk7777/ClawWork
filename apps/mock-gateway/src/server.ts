import { createServer } from "node:http";
import type { GatewayRequest } from "@clawwork/openclaw-protocol";
import { WebSocket, WebSocketServer } from "ws";

const DEMO_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R>>endobj\n4 0 obj<</Length 0>>stream\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "utf8"
);

export type MockGatewayOptions = {
  host?: string;
  port?: number;
  publicOrigin?: string;
  responseDelayMs?: number;
};

function send(socket: WebSocket, value: unknown) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
}

function assistantText(message: string) {
  const normalized = message.replace(/<attached_document[\s\S]*$/i, "").trim();
  const summary = normalized.slice(0, 240) || "empty task";
  return `Mock Gateway completed the task locally. Input: ${summary}`;
}

export async function createMockGateway(options: MockGatewayOptions = {}) {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 18_789;
  const responseDelayMs = options.responseDelayMs ?? 40;
  let origin = options.publicOrigin;

  const httpServer = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health/live") {
      response.writeHead(200, { "Content-Type": "application/json" });
      return response.end(JSON.stringify({ status: "ok", mode: "mock" }));
    }
    if (request.method === "GET" && request.url === "/artifacts/demo-report.pdf") {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": String(DEMO_PDF.length),
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff"
      });
      return response.end(DEMO_PDF);
    }
    if (request.method === "POST" && request.url === "/v1/chat/completions") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      let message = "mock request";
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          messages?: Array<{ content?: unknown }>;
        };
        const last = body.messages?.at(-1)?.content;
        if (typeof last === "string") message = last;
      } catch {
        // The mock intentionally returns a deterministic response for malformed demo input.
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      return response.end(
        JSON.stringify({
          id: "mock-chat-completion",
          choices: [{ message: { role: "assistant", content: assistantText(message) } }]
        })
      );
    }
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: "not found" }));
  });

  const sockets = new Set<WebSocket>();
  const timers = new Map<string, Set<ReturnType<typeof setTimeout>>>();
  const wss = new WebSocketServer({ server: httpServer, maxPayload: 2 * 1024 * 1024 });
  wss.on("connection", (socket) => {
    sockets.add(socket);
    send(socket, {
      type: "event",
      event: "connect.challenge",
      payload: { nonce: "clawwork-local-mock" }
    });

    socket.on("message", (raw) => {
      let frame: GatewayRequest;
      try {
        frame = JSON.parse(raw.toString()) as GatewayRequest;
      } catch {
        return socket.close(1003, "invalid JSON");
      }
      if (frame.type !== "req") return;

      if (frame.method === "connect") {
        return send(socket, {
          type: "res",
          id: frame.id,
          ok: true,
          payload: {
            status: "connected",
            snapshot: { sessionDefaults: { mainSessionKey: "agent:main:main" } }
          }
        });
      }

      if (frame.method === "chat.abort") {
        const runId =
          typeof frame.params.runId === "string" ? frame.params.runId : undefined;
        if (runId) {
          for (const timer of timers.get(runId) ?? []) clearTimeout(timer);
          timers.delete(runId);
        }
        send(socket, { type: "res", id: frame.id, ok: true, payload: { status: "aborted" } });
        return send(socket, {
          type: "event",
          event: "chat",
          payload: {
            runId,
            sessionKey: frame.params.sessionKey,
            state: "aborted",
            ts: Date.now()
          }
        });
      }

      if (frame.method !== "chat.send") return;
      const runId = `mock-run-${frame.id}`;
      const sessionKey =
        typeof frame.params.sessionKey === "string" ? frame.params.sessionKey : "agent:main:main";
      const message = typeof frame.params.message === "string" ? frame.params.message : "";
      send(socket, { type: "res", id: frame.id, ok: true, payload: { runId } });

      const runTimers = new Set<ReturnType<typeof setTimeout>>();
      timers.set(runId, runTimers);
      const schedule = (delay: number, callback: () => void) => {
        const timer = setTimeout(() => {
          runTimers.delete(timer);
          callback();
        }, delay);
        runTimers.add(timer);
      };

      if (message.includes("[disconnect]")) {
        return schedule(responseDelayMs, () => socket.close(1012, "mock disconnect"));
      }
      if (message.includes("[fail]")) {
        return schedule(responseDelayMs, () => {
          send(socket, {
            type: "event",
            event: "chat",
            payload: {
              runId,
              sessionKey,
              state: "error",
              errorMessage: "mock failure requested with [fail]",
              ts: Date.now()
            }
          });
          timers.delete(runId);
        });
      }

      const reply = assistantText(message);
      schedule(responseDelayMs, () =>
        send(socket, {
          type: "event",
          event: "agent",
          payload: {
            runId,
            sessionKey,
            stream: "assistant",
            data: { text: reply.slice(0, Math.ceil(reply.length / 2)) },
            ts: Date.now()
          }
        })
      );
      schedule(responseDelayMs * 2, () => {
        send(socket, {
          type: "event",
          event: "agent",
          payload: {
            runId,
            sessionKey,
            stream: "assistant",
            data: { text: reply },
            ts: Date.now()
          }
        });
        if (message.includes("[artifact]")) {
          send(socket, {
            type: "event",
            event: "agent",
            payload: {
              runId,
              sessionKey,
              stream: "artifact",
              data: {
                type: "artifact",
                artifact: {
                  kind: "pdf",
                  fileName: "mock-report.pdf",
                  mimeType: "application/pdf",
                  downloadUrl: `${origin}/artifacts/demo-report.pdf`,
                  previewText: "Deterministic local artifact from the Mock Gateway.",
                  sizeBytes: DEMO_PDF.length
                }
              },
              ts: Date.now()
            }
          });
        }
      });
      schedule(responseDelayMs * 3, () => {
        send(socket, {
          type: "event",
          event: "chat",
          payload: { runId, sessionKey, state: "final", ts: Date.now() }
        });
        timers.delete(runId);
      });
    });
    socket.once("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, resolve);
  });
  const address = httpServer.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  origin ??= `http://${host}:${actualPort}`;

  return {
    httpUrl: origin,
    wsUrl: origin.replace(/^http/, "ws"),
    close: async () => {
      for (const runTimers of timers.values()) {
        for (const timer of runTimers) clearTimeout(timer);
      }
      timers.clear();
      for (const socket of sockets) socket.close(1001, "mock shutdown");
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve, reject) =>
        httpServer.close((error) => (error ? reject(error) : resolve()))
      );
    }
  };
}
