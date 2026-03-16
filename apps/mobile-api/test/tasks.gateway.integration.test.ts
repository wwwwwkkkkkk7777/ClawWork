import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { createAdapterServer } from "@clawwork/openclaw-adapter";
import { createApp } from "../src/main";

type TaskStreamEvent = {
  type: string;
  taskId: string;
  sessionId: string;
  runId: string;
  timestamp: string;
  delta?: string;
};

async function collectTaskEvents(url: string, expectedCount: number) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/event-stream"
    }
  });

  if (!response.body) {
    throw new Error("missing response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: TaskStreamEvent[] = [];
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

      const dataLine = rawEvent
        .split("\n")
        .find((line) => line.startsWith("data: "));

      if (!dataLine) {
        continue;
      }

      events.push(JSON.parse(dataLine.slice(6)) as TaskStreamEvent);
    }
  }

  reader.releaseLock();
  return events;
}

let gatewayServer: WebSocketServer | undefined;
let adapterServer:
  | {
      url: string;
      close: () => Promise<void>;
    }
  | undefined;

afterEach(async () => {
  gatewayServer?.close();
  gatewayServer = undefined;

  if (adapterServer) {
    await adapterServer.close();
    adapterServer = undefined;
  }

  delete process.env.OPENCLAW_ADAPTER_URL;
});

describe("task flow through gateway adapter", () => {
  it("creates a task through the adapter and proxies real stream events", async () => {
    gatewayServer = new WebSocketServer({ port: 18793 });
    gatewayServer.on("connection", (socket) => {
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
                  ts: Date.now(),
                  data: {
                    text: "gateway stream text",
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
                  runId: "run_2",
                  sessionKey: "main",
                  state: "final"
                }
              })
            );
          }, 20);
        }
      });
    });

    adapterServer = await createAdapterServer({
      gatewayUrl: "ws://127.0.0.1:18793"
    });
    process.env.OPENCLAW_ADAPTER_URL = adapterServer.url;

    const app = await createApp();
    await app.listen(0);

    try {
      const baseUrl = await app.getUrl();

      const createResponse = await fetch(`${baseUrl}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          input: { text: "帮我总结这份文档", fileIds: [] },
          preferredTone: "default",
          preferredLength: "medium"
        })
      });

      expect(createResponse.status).toBe(201);
      const accepted = (await createResponse.json()) as {
        taskId: string;
        streamUrl: string;
      };

      const streamedEvents = await collectTaskEvents(
        `${baseUrl}${accepted.streamUrl}`,
        3
      );

      expect(streamedEvents.map((event) => event.type)).toEqual([
        "task.accepted",
        "task.delta",
        "task.completed"
      ]);
      expect(streamedEvents[1]?.delta).toBe("gateway stream text");
    } finally {
      await app.close();
    }
  });
});
