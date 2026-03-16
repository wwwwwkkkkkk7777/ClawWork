import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { executeGatewayTask, sendTaskToGateway } from "../src/gateway-client";

let server: WebSocketServer | undefined;
let httpServer: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => {
      server?.close(() => resolve());
    });
    server = undefined;
  }

  if (httpServer) {
    await new Promise<void>((resolve, reject) => {
      httpServer?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    httpServer = undefined;
  }
});

async function createGatewayHarness() {
  httpServer = createServer((request, response) => {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: "not found" }));
  });

  server = new WebSocketServer({ server: httpServer });

  await new Promise<void>((resolve) => {
    httpServer?.listen(0, "127.0.0.1", () => resolve());
  });

  const address = httpServer.address() as AddressInfo;
  return {
    port: address.port,
    wsUrl: `ws://127.0.0.1:${address.port}`
  };
}

describe("sendTaskToGateway", () => {
  it("connects then returns accepted run metadata", async () => {
    let capturedConnectParams: Record<string, unknown> | undefined;

    const harness = await createGatewayHarness();
    server!.on("connection", (socket) => {
      socket.send(
        JSON.stringify({ type: "event", event: "connect.challenge", payload: {} })
      );

      socket.on("message", (raw) => {
        const frame = JSON.parse(raw.toString()) as {
          id: string;
          method: string;
          params: Record<string, unknown>;
        };

        if (frame.method === "connect") {
          capturedConnectParams = frame.params;
          socket.send(JSON.stringify({ type: "res", id: "connect-1", ok: true, payload: {} }));
          return;
        }

        socket.send(
          JSON.stringify({
            type: "res",
            id: "task-1",
            ok: true,
            payload: { runId: "run_1" }
          })
        );

        setTimeout(() => {
          socket.send(
            JSON.stringify({
              type: "event",
              event: "chat",
              payload: {
                runId: "run_1",
                sessionKey: "main",
                state: "final"
              }
            })
          );
        }, 10);
      });
    });

    const result = await sendTaskToGateway(harness.wsUrl, {
      requestId: "task-1",
      message: "hello"
    });

    expect(result.runId).toBe("run_1");
    expect(capturedConnectParams).toMatchObject({
      role: "operator",
      scopes: ["operator.read", "operator.write", "operator.talk.secrets"],
      client: {
        id: "openclaw-android",
        mode: "ui"
      }
    });
  });

  it(
    "rejects promptly when gateway connect is denied",
    { timeout: 1500 },
    async () => {
      const harness = await createGatewayHarness();
      server!.on("connection", (socket) => {
        socket.send(
          JSON.stringify({
            type: "event",
            event: "connect.challenge",
            payload: { nonce: "nonce-1" }
          })
        );

        socket.on("message", (raw) => {
          const frame = JSON.parse(raw.toString()) as {
            id: string;
            method: string;
          };

          if (frame.method !== "connect") {
            return;
          }

          socket.send(
            JSON.stringify({
              type: "res",
              id: frame.id,
              ok: false,
              error: {
                code: "NOT_PAIRED",
                message: "device identity required"
              }
            })
          );
        });
      });

      await expect(
        executeGatewayTask(
          {
            gatewayUrl: harness.wsUrl,
            taskId: "task-2",
            sessionId: "session-2",
            message: "hello"
          },
          {
            onEvent: () => undefined
          }
        )
      ).rejects.toMatchObject({
        code: "GATEWAY_HTTP_ENDPOINT_DISABLED"
      });
    }
  );

  it("falls back to the HTTP chat completions endpoint when websocket pairing is required", async () => {
    let authorizationHeader = "";
    let agentIdHeader = "";
    let sessionKeyHeader = "";

    httpServer = createServer((request, response) => {
      if (request.method === "POST" && request.url === "/v1/chat/completions") {
        authorizationHeader = String(request.headers.authorization ?? "");
        agentIdHeader = String(request.headers["x-openclaw-agent-id"] ?? "");
        sessionKeyHeader = String(request.headers["x-openclaw-session-key"] ?? "");

        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            id: "chatcmpl-1",
            choices: [
              {
                message: {
                  content: "HTTP fallback reply"
                }
              }
            ]
          })
        );
        return;
      }

      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ message: "not found" }));
    });

    server = new WebSocketServer({ server: httpServer });
    server.on("connection", (socket) => {
      socket.send(
        JSON.stringify({
          type: "event",
          event: "connect.challenge",
          payload: { nonce: "nonce-2" }
        })
      );

      socket.on("message", (raw) => {
        const frame = JSON.parse(raw.toString()) as {
          id: string;
          method: string;
        };

        if (frame.method !== "connect") {
          return;
        }

        socket.send(
          JSON.stringify({
            type: "res",
            id: frame.id,
            ok: false,
            error: {
              code: "NOT_PAIRED",
              message: "device identity required"
            }
          })
        );
      });
    });

    await new Promise<void>((resolve) => {
      httpServer?.listen(0, "127.0.0.1", () => resolve());
    });

    const { port } = httpServer.address() as AddressInfo;
    const events: string[] = [];
    const deltas: string[] = [];

    const result = await executeGatewayTask(
      {
        gatewayUrl: `ws://127.0.0.1:${port}`,
        gatewayToken: "token-123",
        taskId: "task-3",
        sessionId: "session-3",
        message: "hello"
      },
      {
        onEvent: (event) => {
          events.push(event.type);
          if (event.type === "task.delta") {
            deltas.push(event.delta);
          }
        }
      }
    );

    expect(result.runId).toBe("chatcmpl-1");
    expect(events).toEqual(["task.accepted", "task.delta", "task.completed"]);
    expect(deltas).toEqual(["HTTP fallback reply"]);
    expect(authorizationHeader).toBe("Bearer token-123");
    expect(agentIdHeader).toBe("main");
    expect(sessionKeyHeader).toBe("main");
  });

  it("normalizes cumulative assistant snapshots into incremental deltas", async () => {
    const harness = await createGatewayHarness();
    const deltas: string[] = [];

    server!.on("connection", (socket) => {
      socket.send(
        JSON.stringify({
          type: "event",
          event: "connect.challenge",
          payload: { nonce: "nonce-3" }
        })
      );

      socket.on("message", (raw) => {
        const frame = JSON.parse(raw.toString()) as {
          id: string;
          method: string;
        };

        if (frame.method === "connect") {
          socket.send(
            JSON.stringify({
              type: "res",
              id: frame.id,
              ok: true,
              payload: {
                snapshot: {
                  sessionDefaults: {
                    mainSessionKey: "main"
                  }
                }
              }
            })
          );
          return;
        }

        socket.send(
          JSON.stringify({
            type: "res",
            id: frame.id,
            ok: true,
            payload: {
              runId: "run_2",
              status: "accepted"
            }
          })
        );

        setTimeout(() => {
          socket.send(
            JSON.stringify({
              type: "event",
              event: "agent",
              payload: {
                runId: "run_2",
                stream: "assistant",
                data: { text: "hello" }
              }
            })
          );
        }, 10);

        setTimeout(() => {
          socket.send(
            JSON.stringify({
              type: "event",
              event: "agent",
              payload: {
                runId: "run_2",
                stream: "assistant",
                data: { text: "hello there" }
              }
            })
          );
        }, 20);

        setTimeout(() => {
          socket.send(
            JSON.stringify({
              type: "event",
              event: "agent",
              payload: {
                runId: "run_2",
                stream: "assistant",
                data: { text: "hello there!" }
              }
            })
          );
        }, 30);

        setTimeout(() => {
          socket.send(
            JSON.stringify({
              type: "event",
              event: "chat",
              payload: {
                runId: "run_2",
                sessionKey: "main",
                state: "final"
              }
            })
          );
        }, 40);
      });
    });

    await executeGatewayTask(
      {
        gatewayUrl: harness.wsUrl,
        taskId: "task-4",
        sessionId: "session-4",
        message: "hello"
      },
      {
        onEvent: (event) => {
          if (event.type === "task.delta") {
            deltas.push(event.delta);
          }
        }
      }
    );

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(deltas).toEqual(["hello", " there", "!"]);
  });
});
