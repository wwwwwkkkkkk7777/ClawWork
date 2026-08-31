import type { AddressInfo } from "node:net";
import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { createMockGateway } from "../src/server";

let closeServer: (() => Promise<void>) | undefined;

afterEach(async () => {
  await closeServer?.();
  closeServer = undefined;
});

describe("mock gateway", () => {
  it("accepts a task and emits deterministic assistant and final frames", async () => {
    const server = await createMockGateway({ port: 0, responseDelayMs: 5 });
    closeServer = server.close;
    const socket = new WebSocket(server.wsUrl);
    const frames: Array<Record<string, unknown>> = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("mock gateway test timed out")), 2_000);
      socket.on("message", (raw) => {
        const frame = JSON.parse(raw.toString()) as Record<string, unknown> & {
          event?: string;
          payload?: { state?: string };
        };
        frames.push(frame);
        if (frame.event === "connect.challenge") {
          socket.send(
            JSON.stringify({ type: "req", id: "connect", method: "connect", params: {} })
          );
        } else if (frame.type === "res" && frame.id === "connect") {
          socket.send(
            JSON.stringify({
              type: "req",
              id: "task-1",
              method: "chat.send",
              params: { sessionKey: "agent:main:session:test", message: "hello" }
            })
          );
        } else if (frame.event === "chat" && frame.payload?.state === "final") {
          clearTimeout(timeout);
          resolve();
        }
      });
      socket.once("error", reject);
    });

    expect(frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "res", id: "task-1", ok: true }),
        expect.objectContaining({ type: "event", event: "agent" }),
        expect.objectContaining({
          type: "event",
          event: "chat",
          payload: expect.objectContaining({ state: "final" })
        })
      ])
    );
    socket.close();
  });
});
