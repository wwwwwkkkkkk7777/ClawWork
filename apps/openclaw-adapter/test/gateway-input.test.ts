import { createServer } from "node:http";
import { type AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { prepareGatewayInput } from "../src/gateway-input";

let server: ReturnType<typeof createServer> | undefined;
const originalParserUrl = process.env.FILE_PARSER_URL;
const originalParserToken = process.env.FILE_PARSER_INTERNAL_TOKEN;

afterEach(async () => {
  if (originalParserUrl === undefined) delete process.env.FILE_PARSER_URL;
  else process.env.FILE_PARSER_URL = originalParserUrl;
  if (originalParserToken === undefined) delete process.env.FILE_PARSER_INTERNAL_TOKEN;
  else process.env.FILE_PARSER_INTERNAL_TOKEN = originalParserToken;
  if (!server) return;
  await new Promise<void>((resolve, reject) =>
    server?.close((error) => (error ? reject(error) : resolve()))
  );
  server = undefined;
});

describe("gateway object input", () => {
  it("downloads a signed-style content URL and converts an image for the Gateway", async () => {
    const content = Buffer.from("image-bytes");
    server = createServer((_request, response) => {
      response.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Length": String(content.length)
      });
      response.end(content);
    });
    await new Promise<void>((resolve, reject) => {
      server?.listen(0, "127.0.0.1", resolve);
      server?.once("error", reject);
    });
    const address = server.address() as AddressInfo;

    const prepared = await prepareGatewayInput("describe this", [
      {
        fileId: "file-1",
        filename: "source.png",
        mimeType: "image/png",
        sizeBytes: content.length,
        storageKey: "users/u/file-1/source.png",
        contentUrl: `http://127.0.0.1:${address.port}/source.png?signature=test`
      }
    ]);

    expect(prepared.attachments).toEqual([
      {
        type: "image",
        mimeType: "image/png",
        fileName: "source.png",
        content: content.toString("base64")
      }
    ]);
  });

  it("sends documents to the isolated parser service", async () => {
    const content = Buffer.from("# Private notes");
    server = createServer(async (request, response) => {
      if (request.url === "/source.md") {
        response.writeHead(200, { "Content-Length": String(content.length) });
        return response.end(content);
      }
      if (request.url === "/parse" && request.method === "POST") {
        expect(request.headers["x-file-extension"]).toBe(".md");
        expect(request.headers.authorization).toBe("Bearer parser-test-token");
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        expect(Buffer.concat(chunks)).toEqual(content);
        response.writeHead(200, { "Content-Type": "application/json" });
        return response.end(JSON.stringify({ ok: true, text: "Private notes" }));
      }
      response.writeHead(404);
      response.end();
    });
    await new Promise<void>((resolve, reject) => {
      server?.listen(0, "127.0.0.1", resolve);
      server?.once("error", reject);
    });
    const address = server.address() as AddressInfo;
    process.env.FILE_PARSER_URL = `http://127.0.0.1:${address.port}`;
    process.env.FILE_PARSER_INTERNAL_TOKEN = "parser-test-token";

    const prepared = await prepareGatewayInput("summarize", [
      {
        fileId: "file-2",
        filename: "notes.md",
        mimeType: "text/markdown",
        sizeBytes: content.length,
        storageKey: "users/u/file-2/notes.md",
        contentUrl: `http://127.0.0.1:${address.port}/source.md`
      }
    ]);

    expect(prepared.message).toContain("Private notes");
    expect(prepared.attachments).toEqual([]);
  });
});
