import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { createAdapterServer } from "@clawwork/openclaw-adapter";
import type { TaskStreamEvent } from "@clawwork/shared-types";
import { createApp } from "../src/main";
import { createServer, type Server } from "node:http";

async function collectTaskEvents(
  url: string,
  expectedCount: number,
  accessToken: string,
  lastEventId?: number
) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${accessToken}`,
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

function expectedSessionKey(sessionId: string) {
  return `agent:main:session:${sessionId.toLowerCase()}`;
}

let gatewayServer: WebSocketServer | undefined;
let artifactServer: Server | undefined;
const originalArtifactOrigins = process.env.RESULT_ARTIFACT_ALLOWED_ORIGINS;
const originalParserUrl = process.env.FILE_PARSER_URL;
const originalParserToken = process.env.FILE_PARSER_INTERNAL_TOKEN;
let adapterServer:
  | {
      url: string;
      close: () => Promise<void>;
    }
  | undefined;

afterEach(async () => {
  if (adapterServer) {
    await adapterServer.close();
    adapterServer = undefined;
  }

  gatewayServer?.close();
  gatewayServer = undefined;

  if (artifactServer) {
    await new Promise<void>((resolve, reject) =>
      artifactServer?.close((error) => error ? reject(error) : resolve())
    );
    artifactServer = undefined;
  }

  delete process.env.OPENCLAW_ADAPTER_URL;
  if (originalArtifactOrigins === undefined) {
    delete process.env.RESULT_ARTIFACT_ALLOWED_ORIGINS;
  } else {
    process.env.RESULT_ARTIFACT_ALLOWED_ORIGINS = originalArtifactOrigins;
  }
  if (originalParserUrl === undefined) {
    delete process.env.FILE_PARSER_URL;
  } else {
    process.env.FILE_PARSER_URL = originalParserUrl;
  }
  if (originalParserToken === undefined) {
    delete process.env.FILE_PARSER_INTERNAL_TOKEN;
  } else {
    process.env.FILE_PARSER_INTERNAL_TOKEN = originalParserToken;
  }
});

describe("task flow through gateway adapter", () => {
  it("forwards task files to the adapter and proxies artifact stream events", async () => {
    let capturedChatSendParams: Record<string, unknown> | undefined;
    const artifactBytes = Buffer.from("archived spreadsheet bytes");
    artifactServer = createServer(async (request, response) => {
      if (request.url === "/parse" && request.method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        expect(request.headers.authorization).toBe("Bearer parser-test-token");
        expect(Buffer.concat(chunks)).toEqual(Buffer.from("pdf-body"));
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true, text: "parsed pdf body" }));
        return;
      }
      if (request.url !== "/weekly-report.xlsx") {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      response.setHeader("Content-Length", artifactBytes.length);
      response.end(artifactBytes);
    });
    await new Promise<void>((resolve) => artifactServer?.listen(0, "127.0.0.1", resolve));
    const artifactAddress = artifactServer.address();
    if (!artifactAddress || typeof artifactAddress === "string") {
      throw new Error("artifact server address unavailable");
    }
    const artifactOrigin = `http://127.0.0.1:${artifactAddress.port}`;
    process.env.RESULT_ARTIFACT_ALLOWED_ORIGINS = artifactOrigin;
    process.env.FILE_PARSER_URL = artifactOrigin;
    process.env.FILE_PARSER_INTERNAL_TOKEN = "parser-test-token";

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
          params?: Record<string, unknown>;
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
                    text: "gateway stream text"
                  }
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
                  stream: "artifact",
                  ts: Date.now(),
                  data: {
                    type: "artifact",
                    artifact: {
                      kind: "excel",
                      fileName: "weekly-report.xlsx",
                      mimeType:
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                      downloadUrl: `${artifactOrigin}/weekly-report.xlsx`,
                      previewText: "已整理为可下载表格"
                    }
                  }
                }
              })
            );
          }, 20);

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
          }, 30);
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
      const loginResponse = await fetch(`${baseUrl}/auth/dev-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: "Gateway User",
          email: `gateway-${process.pid}@example.com`
        })
      });
      const { accessToken } = (await loginResponse.json()) as { accessToken: string };
      const content = Buffer.from("pdf-body");

      const uploadResponse = await fetch(`${baseUrl}/files/upload-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          filename: "source.pdf",
          mimeType: "application/pdf",
          sizeBytes: content.length
        })
      });
      const upload = (await uploadResponse.json()) as {
        fileId: string;
        uploadUrl: string;
        storageKey: string;
      };

      await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(content.length)
        },
        body: content
      });

      await fetch(`${baseUrl}/files/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          fileId: upload.fileId,
          filename: "source.pdf",
          mimeType: "application/pdf",
          sizeBytes: content.length,
          storageKey: upload.storageKey
        })
      });

      const createResponse = await fetch(`${baseUrl}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          input: { text: "帮我整理成表格", fileIds: [upload.fileId] },
          preferredTone: "default",
          preferredLength: "medium"
        })
      });

      expect(createResponse.status).toBe(201);
      const accepted = (await createResponse.json()) as {
        taskId: string;
        sessionId: string;
        streamUrl: string;
      };

      const streamedEvents = await collectTaskEvents(
        `${baseUrl}${accepted.streamUrl}`,
        4,
        accessToken
      );

      expect(streamedEvents.map((item) => item.event.type)).toEqual([
        "task.accepted",
        "task.delta",
        "task.result.created",
        "task.completed"
      ]);
      expect(streamedEvents[1]?.event.type).toBe("task.delta");
      if (streamedEvents[1]?.event.type === "task.delta") {
        expect(streamedEvents[1].event.delta).toBe("gateway stream text");
      }

      expect(streamedEvents[2]?.event.type).toBe("task.result.created");
      if (streamedEvents[2]?.event.type === "task.result.created") {
        expect(streamedEvents[2].event.result).toMatchObject({
          type: "artifact",
          artifact: {
            kind: "excel",
            fileName: "weekly-report.xlsx",
            downloadUrl: expect.stringMatching(/^https?:\/\//)
          }
        });
      }

      expect(String(capturedChatSendParams?.message ?? "")).toContain("source.pdf");
      expect(String(capturedChatSendParams?.message ?? "")).toContain("parsed pdf body");
      expect(capturedChatSendParams?.sessionKey).toBe(expectedSessionKey(accepted.sessionId));
      expect(capturedChatSendParams?.attachments).toBeUndefined();
      expect(capturedChatSendParams?.files).toBeUndefined();

      const resumedEvents = await collectTaskEvents(
        `${baseUrl}${accepted.streamUrl}`,
        2,
        accessToken,
        streamedEvents[1]?.id
      );
      expect(resumedEvents.map((item) => item.event.type)).toEqual([
        "task.result.created",
        "task.completed"
      ]);

      const versionsResponse = await fetch(
        `${baseUrl}/tasks/${accepted.taskId}/versions`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const versions = (await versionsResponse.json()) as Array<{
        versionNo: number;
        outputText: string;
        outputJson: { artifact?: { downloadUrl?: string; sizeBytes?: number } };
      }>;
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({
        versionNo: 1,
        outputText: "gateway stream text"
      });
      expect(versions[0]?.outputJson.artifact).toMatchObject({
        sizeBytes: artifactBytes.length,
        downloadUrl: expect.stringContaining("X-Amz-Signature=")
      });
    } finally {
      await app.close();
    }
  });
});
