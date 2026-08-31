import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { PersistentGatewayClient } from "../src/persistent-gateway-client";
import type { TaskStreamEvent } from "@clawwork/shared-types";

let server: WebSocketServer | undefined;
let client: PersistentGatewayClient | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

describe("persistent gateway cancellation", () => {
  it("sends chat.abort and emits a cancelled terminal event", async () => {
    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing server port");

    let resolveAbort: ((value: Record<string, unknown>) => void) | undefined;
    const abortFrame = new Promise<Record<string, unknown>>((resolve) => {
      resolveAbort = resolve;
    });
    server.on("connection", (socket) => {
      socket.send(JSON.stringify({
        type: "event",
        event: "connect.challenge",
        payload: { nonce: "cancel-test" }
      }));
      socket.on("message", (raw) => {
        const frame = JSON.parse(raw.toString()) as {
          id: string;
          method: string;
          params: Record<string, unknown>;
        };
        if (frame.method === "connect") {
          socket.send(JSON.stringify({ type: "res", id: frame.id, ok: true, payload: {} }));
        } else if (frame.method === "chat.send") {
          socket.send(JSON.stringify({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { runId: "run-cancel" }
          }));
        } else if (frame.method === "chat.abort") {
          resolveAbort?.(frame);
        }
      });
    });

    client = new PersistentGatewayClient({
      gatewayUrl: `ws://127.0.0.1:${address.port}`,
      taskTimeoutMs: 5_000
    });
    const events: TaskStreamEvent[] = [];
    await client.execute(
      { taskId: "task-cancel", sessionId: "session-cancel", message: "cancel me" },
      { onEvent: (event) => events.push(event) }
    );

    expect(client.cancel("task-cancel")).toMatchObject({ runId: "run-cancel" });
    await expect(abortFrame).resolves.toMatchObject({
      method: "chat.abort",
      params: { runId: "run-cancel" }
    });
    expect(events.map((event) => event.type)).toEqual([
      "task.accepted",
      "task.cancelled"
    ]);
  });
});
