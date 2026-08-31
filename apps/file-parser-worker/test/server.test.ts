import { afterEach, describe, expect, it } from "vitest";
import { createParserServer } from "../src/server";

let closeServer: (() => Promise<void>) | undefined;

afterEach(async () => {
  await closeServer?.();
  closeServer = undefined;
});

describe("isolated parser server", () => {
  it("requires the internal token and parses in the child process", async () => {
    const server = await createParserServer({
      host: "127.0.0.1",
      port: 0,
      internalToken: "test-parser-token",
      maxFileBytes: 1024,
      timeoutMs: 10_000
    });
    closeServer = server.close;

    const unauthorized = await fetch(`${server.url}/parse`, {
      method: "POST",
      headers: { "X-File-Extension": ".md" },
      body: Buffer.from("# Notes")
    });
    expect(unauthorized.status).toBe(401);

    const response = await fetch(`${server.url}/parse`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-parser-token",
        "Content-Type": "application/octet-stream",
        "X-File-Extension": ".md"
      },
      body: Buffer.from("# Notes")
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, text: "# Notes" });
  });

  it("rejects oversized bodies before parsing", async () => {
    const server = await createParserServer({
      host: "127.0.0.1",
      port: 0,
      internalToken: "test-parser-token",
      maxFileBytes: 4
    });
    closeServer = server.close;

    const response = await fetch(`${server.url}/parse`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-parser-token",
        "Content-Type": "application/octet-stream",
        "X-File-Extension": ".txt"
      },
      body: Buffer.from("too large")
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ code: "FILE_TOO_LARGE" });
  });
});
