import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { executeGatewayTask, sendTaskToGateway } from "../src/gateway-client";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/woAAn8B9FD5fHAAAAAASUVORK5CYII=",
  "base64"
);

let server: WebSocketServer | undefined;
let httpServer: Server | undefined;
let tempDir: string | undefined;
const originalParserUrl = process.env.FILE_PARSER_URL;

afterEach(async () => {
  if (originalParserUrl === undefined) delete process.env.FILE_PARSER_URL;
  else process.env.FILE_PARSER_URL = originalParserUrl;
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

  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

function expectedSessionKey(sessionId: string) {
  return `agent:main:session:${sessionId.toLowerCase()}`;
}

async function createGatewayHarness() {
  httpServer = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/parse") {
      request.resume();
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, text: "Extracted document text" }));
      return;
    }
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: "not found" }));
  });

  server = new WebSocketServer({ server: httpServer });

  await new Promise<void>((resolve) => {
    httpServer?.listen(0, "127.0.0.1", () => resolve());
  });

  const address = httpServer.address() as AddressInfo;
  process.env.FILE_PARSER_URL = `http://127.0.0.1:${address.port}`;
  return {
    port: address.port,
    wsUrl: `ws://127.0.0.1:${address.port}`
  };
}

describe("sendTaskToGateway", () => {
  it("connects then returns accepted run metadata", async () => {
    let capturedConnectParams: Record<string, unknown> | undefined;
    let capturedChatSendParams: Record<string, unknown> | undefined;

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

        capturedChatSendParams = frame.params;

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
    expect(capturedChatSendParams?.sessionKey).toBe(expectedSessionKey("session-1"));
    expect(capturedChatSendParams?.files).toBeUndefined();
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
    expect(sessionKeyHeader).toBe(expectedSessionKey("session-3"));
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

  it("keeps image files as OpenClaw attachments", async () => {
    const harness = await createGatewayHarness();
    let capturedChatParams: Record<string, unknown> | undefined;
    tempDir = mkdtempSync(join(tmpdir(), "clawwork-gateway-client-"));
    const contentPath = join(tempDir, "source.png");
    writeFileSync(contentPath, PNG_1X1);

    server!.on("connection", (socket) => {
      socket.send(
        JSON.stringify({
          type: "event",
          event: "connect.challenge",
          payload: { nonce: "nonce-4" }
        })
      );

      socket.on("message", (raw) => {
        const frame = JSON.parse(raw.toString()) as {
          id: string;
          method: string;
          params: Record<string, unknown>;
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

        capturedChatParams = frame.params;
        socket.send(
          JSON.stringify({
            type: "res",
            id: frame.id,
            ok: true,
            payload: {
              runId: "run-files",
              status: "accepted"
            }
          })
        );

        setTimeout(() => {
          socket.send(
            JSON.stringify({
              type: "event",
              event: "chat",
              payload: {
                runId: "run-files",
                sessionKey: "main",
                state: "final"
              }
            })
          );
        }, 10);
      });
    });

    await executeGatewayTask(
      {
        gatewayUrl: harness.wsUrl,
        taskId: "task-files",
        sessionId: "session-files",
        message: "整理这个文件",
        files: [
          {
            fileId: "file-1",
            filename: "source.png",
            mimeType: "image/png",
            sizeBytes: PNG_1X1.length,
            storageKey: "clawwork/file-1/source.png",
            contentPath
          }
        ]
      },
      {
        onEvent: () => undefined
      }
    );

    expect(capturedChatParams?.attachments).toEqual([
      {
        type: "image",
        mimeType: "image/png",
        fileName: "source.png",
        content: PNG_1X1.toString("base64")
      }
    ]);
    expect(capturedChatParams?.files).toBeUndefined();
  });

  it("folds document files into the gateway message so non-image attachments are not dropped", async () => {
    const harness = await createGatewayHarness();
    let capturedChatParams: Record<string, unknown> | undefined;
    tempDir = mkdtempSync(join(tmpdir(), "clawwork-gateway-client-"));
    const contentPath = join(tempDir, "source.pdf");
    writeFileSync(contentPath, "pdf-body");

    server!.on("connection", (socket) => {
      socket.send(
        JSON.stringify({
          type: "event",
          event: "connect.challenge",
          payload: { nonce: "nonce-4b" }
        })
      );

      socket.on("message", (raw) => {
        const frame = JSON.parse(raw.toString()) as {
          id: string;
          method: string;
          params: Record<string, unknown>;
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

        capturedChatParams = frame.params;
        socket.send(
          JSON.stringify({
            type: "res",
            id: frame.id,
            ok: true,
            payload: {
              runId: "run-doc",
              status: "accepted"
            }
          })
        );

        setTimeout(() => {
          socket.send(
            JSON.stringify({
              type: "event",
              event: "chat",
              payload: {
                runId: "run-doc",
                sessionKey: "main",
                state: "final"
              }
            })
          );
        }, 10);
      });
    });

    await executeGatewayTask(
      {
        gatewayUrl: harness.wsUrl,
        taskId: "task-doc",
        sessionId: "session-doc",
        message: "请整理这份文档",
        files: [
          {
            fileId: "file-2",
            filename: "source.pdf",
            mimeType: "application/pdf",
            sizeBytes: Buffer.byteLength("pdf-body"),
            storageKey: "clawwork/file-2/source.pdf",
            contentPath
          }
        ]
      },
      {
        onEvent: () => undefined
      }
    );

    expect(capturedChatParams?.message).toContain("请整理这份文档");
    expect(capturedChatParams?.message).toContain("source.pdf");
    expect(capturedChatParams?.attachments).toBeUndefined();
    expect(capturedChatParams?.files).toBeUndefined();
  });

  it("maps structured gateway artifacts into task.result.created events", async () => {
    const harness = await createGatewayHarness();
    const events: Array<{ type: string; result?: unknown }> = [];

    server!.on("connection", (socket) => {
      socket.send(
        JSON.stringify({
          type: "event",
          event: "connect.challenge",
          payload: { nonce: "nonce-5" }
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
              runId: "run-artifact",
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
                runId: "run-artifact",
                stream: "artifact",
                data: {
                  type: "artifact",
                  artifact: {
                    kind: "pdf",
                    fileName: "summary.pdf",
                    mimeType: "application/pdf",
                    downloadUrl: "https://example.com/summary.pdf",
                    previewText: "已生成 PDF 版本"
                  }
                }
              }
            })
          );
        }, 10);

        setTimeout(() => {
          socket.send(
            JSON.stringify({
              type: "event",
              event: "chat",
              payload: {
                runId: "run-artifact",
                sessionKey: "main",
                state: "final"
              }
            })
          );
        }, 20);
      });
    });

    await executeGatewayTask(
      {
        gatewayUrl: harness.wsUrl,
        taskId: "task-artifact",
        sessionId: "session-artifact",
        message: "导出 PDF"
      },
      {
        onEvent: (event) => {
          events.push({
            type: event.type,
            result: "result" in event ? event.result : undefined
          });
        }
      }
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(events.map((event) => event.type)).toContain("task.result.created");
    expect(events.find((event) => event.type === "task.result.created")?.result).toMatchObject({
      type: "artifact",
      artifact: {
        kind: "pdf",
        fileName: "summary.pdf",
        downloadUrl: "https://example.com/summary.pdf"
      }
    });
  });
});
