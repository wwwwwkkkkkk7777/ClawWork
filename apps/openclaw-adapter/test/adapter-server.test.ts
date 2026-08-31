import { createServer, type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { createAdapterServer } from "../src/server";

type TaskStreamEvent = {
  type: string;
  taskId: string;
  sessionId: string;
  runId: string;
  timestamp: string;
  delta?: string;
  code?: string;
};

async function collectTaskEvents(url: string, expectedCount: number, lastEventId?: number) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/event-stream",
      ...(lastEventId ? { "Last-Event-ID": String(lastEventId) } : {})
    }
  });

  if (!response.body) {
    throw new Error("missing response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: Array<{ id: number; event: TaskStreamEvent }> = [];
  let buffer = "";

  while (events.length < expectedCount) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    while (buffer.includes("\n\n")) {
      const separatorIndex = buffer.indexOf("\n\n");
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const lines = rawEvent.split("\n");
      const dataLine = lines.find((line) => line.startsWith("data: "));
      const idLine = lines.find((line) => line.startsWith("id: "));

      if (!dataLine || !idLine) {
        continue;
      }

      events.push({
        id: Number(idLine.slice(4)),
        event: JSON.parse(dataLine.slice(6)) as TaskStreamEvent
      });
    }
  }

  reader.releaseLock();
  return events;
}

let gatewayServer: WebSocketServer | undefined;
let gatewayHttpServer: Server | undefined;
let adapterServer:
  | {
      url: string;
      close: () => Promise<void>;
    }
  | undefined;

async function createGatewayHarness() {
  gatewayHttpServer = createServer((request, response) => {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: "not found" }));
  });
  gatewayServer = new WebSocketServer({ server: gatewayHttpServer });

  await new Promise<void>((resolve, reject) => {
    gatewayHttpServer?.listen(0, "127.0.0.1", () => resolve());
    gatewayHttpServer?.once("error", reject);
  });

  const address = gatewayHttpServer.address() as AddressInfo;
  return {
    wsUrl: `ws://127.0.0.1:${address.port}`
  };
}

afterEach(async () => {
  if (adapterServer) {
    await adapterServer.close();
    adapterServer = undefined;
  }

  gatewayServer?.close();
  gatewayServer = undefined;

  if (gatewayHttpServer) {
    await new Promise<void>((resolve, reject) => {
      gatewayHttpServer?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    gatewayHttpServer = undefined;
  }

});

function expectedSessionKey(sessionId: string) {
  return `agent:main:session:${sessionId.toLowerCase()}`;
}

describe("openclaw adapter server", () => {
  it("protects internal task endpoints and exposes health and metrics", async () => {
    adapterServer = await createAdapterServer({
      gatewayUrl: "ws://127.0.0.1:1",
      internalToken: "test-internal-token",
      allowedContentOrigin: "http://minio:9000"
    });

    const unauthorized = await fetch(`${adapterServer.url}/gateway/tasks/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: "task", sessionId: "session", message: "hello" })
    });
    expect(unauthorized.status).toBe(401);
    const invalidFileOrigin = await fetch(`${adapterServer.url}/gateway/tasks/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-internal-token"
      },
      body: JSON.stringify({
        taskId: "task",
        sessionId: "session",
        message: "hello",
        files: [
          {
            fileId: "file",
            filename: "source.pdf",
            mimeType: "application/pdf",
            sizeBytes: 8,
            storageKey: "users/u/file/source.pdf",
            contentUrl: "http://127.0.0.1:1234/admin"
          }
        ]
      })
    });
    expect(invalidFileOrigin.status).toBe(400);
    expect((await fetch(`${adapterServer.url}/health/live`)).status).toBe(200);
    const metrics = await fetch(`${adapterServer.url}/metrics`);
    expect(metrics.status).toBe(200);
    expect(await metrics.text()).toContain("clawwork_adapter_executions_total");
  });

  it("executes chat.send through gateway and streams mapped task events", async () => {
    let capturedChatSendParams: Record<string, unknown> | undefined;
    let connectionCount = 0;

    const harness = await createGatewayHarness();
    const gatewaySocketServer = gatewayServer;
    if (!gatewaySocketServer) {
      throw new Error("gateway server not initialized");
    }

    gatewaySocketServer.on("connection", (socket) => {
      connectionCount += 1;
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

        if (frame.method === "chat.send") {
          capturedChatSendParams = frame.params;
          const runId = frame.id === "task-1" ? "run_1" : "run_2";

          socket.send(
            JSON.stringify({
              type: "res",
              id: frame.id,
              ok: true,
              payload: {
                runId,
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
                  runId,
                  stream: "assistant",
                  ts: Date.now(),
                  data: {
                    text: frame.id === "task-1" ? "draft line" : "second line",
                    sessionKey: "main"
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
                  runId,
                  sessionKey: "main",
                  state: frame.id === "task-3" ? "aborted" : "final"
                }
              })
            );
          }, 20);
        }
      });
    });

    adapterServer = await createAdapterServer({
      gatewayUrl: harness.wsUrl
    });

    const executeResponse = await fetch(`${adapterServer.url}/gateway/tasks/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        taskId: "task-1",
        sessionId: "session-1",
        message: "hello"
      })
    });

    expect(executeResponse.status).toBe(202);

    const accepted = (await executeResponse.json()) as {
      taskId: string;
      sessionId: string;
      runId: string;
      sessionKey: string;
      streamUrl: string;
    };

    expect(accepted.runId).toBe("run_1");
    expect(accepted.sessionKey).toBe(expectedSessionKey("session-1"));

    const streamedEvents = await collectTaskEvents(
      `${adapterServer.url}/gateway/tasks/task-1/events`,
      3
    );

    expect(streamedEvents.map((item) => item.event.type)).toEqual([
      "task.accepted",
      "task.delta",
      "task.completed"
    ]);
    expect(streamedEvents[1]?.event.delta).toBe("draft line");
    expect(capturedChatSendParams?.sessionKey).toBe(expectedSessionKey("session-1"));
    expect(capturedChatSendParams?.idempotencyKey).toBe("task-1");

    const resumedEvents = await collectTaskEvents(
      `${adapterServer.url}/gateway/tasks/task-1/events`,
      1,
      streamedEvents[1]?.id
    );
    expect(resumedEvents.map((item) => item.event.type)).toEqual(["task.completed"]);

    const secondResponse = await fetch(`${adapterServer.url}/gateway/tasks/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: "task-2",
        sessionId: "session-2",
        message: "again"
      })
    });
    expect(secondResponse.status).toBe(202);
    const secondEvents = await collectTaskEvents(
      `${adapterServer.url}/gateway/tasks/task-2/events`,
      3
    );
    expect(secondEvents.map((item) => item.event.type)).toEqual([
      "task.accepted",
      "task.delta",
      "task.completed"
    ]);

    const abortedResponse = await fetch(`${adapterServer.url}/gateway/tasks/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: "task-3",
        sessionId: "session-3",
        message: "abort"
      })
    });
    expect(abortedResponse.status).toBe(202);
    const abortedEvents = await collectTaskEvents(
      `${adapterServer.url}/gateway/tasks/task-3/events`,
      3
    );
    expect(abortedEvents.at(-1)?.event).toMatchObject({
      type: "task.failed",
      code: "GATEWAY_ABORTED"
    });
    expect(connectionCount).toBe(1);
  });
});
