import { WebSocketServer } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { sendTaskToGateway } from "../src/gateway-client";

let server: WebSocketServer | undefined;

afterEach(() => server?.close());

describe("sendTaskToGateway", () => {
  it("connects then returns accepted run metadata", async () => {
    server = new WebSocketServer({ port: 18791 });
    server.on("connection", (socket) => {
      socket.send(
        JSON.stringify({ type: "event", event: "connect.challenge", payload: {} })
      );
      socket.on("message", () => {
        socket.send(JSON.stringify({ type: "res", id: "connect-1", ok: true, payload: {} }));
        socket.send(
          JSON.stringify({
            type: "res",
            id: "task-1",
            ok: true,
            payload: { runId: "run_1" }
          })
        );
      });
    });

    const result = await sendTaskToGateway("ws://127.0.0.1:18791", {
      requestId: "task-1",
      message: "hello"
    });

    expect(result.runId).toBe("run_1");
  });
});
