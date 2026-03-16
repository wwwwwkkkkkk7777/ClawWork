import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { executeGatewayTask } from "./gateway-client";
import { TaskEventBroker } from "./event-broker";

type AdapterServerOptions = {
  gatewayUrl: string;
  gatewayToken?: string;
  gatewayPassword?: string;
  port?: number;
};

type ExecuteTaskPayload = {
  taskId: string;
  sessionId: string;
  message: string;
};

function writeJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

function writeSseEvent(response: ServerResponse, payload: unknown) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function isTerminalEvent(event: { type: string }) {
  return event.type === "task.completed" || event.type === "task.failed";
}

async function readJsonBody<T>(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

export async function createAdapterServer(options: AdapterServerOptions) {
  const broker = new TaskEventBroker();

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "POST" && requestUrl.pathname === "/gateway/tasks/execute") {
      const payload = await readJsonBody<ExecuteTaskPayload>(request);

      try {
        const accepted = await executeGatewayTask(
          {
            gatewayUrl: options.gatewayUrl,
            gatewayToken: options.gatewayToken,
            gatewayPassword: options.gatewayPassword,
            taskId: payload.taskId,
            sessionId: payload.sessionId,
            message: payload.message
          },
          {
            onEvent: (event) => broker.publish(payload.taskId, event)
          }
        );

        writeJson(response, 202, {
          ...accepted,
          streamUrl: `/gateway/tasks/${payload.taskId}/events`
        });
      } catch (error) {
        writeJson(response, 502, {
          code: "GATEWAY_UNAVAILABLE",
          message: error instanceof Error ? error.message : "gateway request failed"
        });
      }
      return;
    }

    const taskEventsMatch = requestUrl.pathname.match(/^\/gateway\/tasks\/([^/]+)\/events$/);
    if (request.method === "GET" && taskEventsMatch) {
      const taskId = decodeURIComponent(taskEventsMatch[1] ?? "");
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      });

      const replay = broker.replay(taskId);
      for (const event of replay) {
        writeSseEvent(response, event);
      }

      const lastReplayEvent = replay.at(-1);
      if (lastReplayEvent && isTerminalEvent(lastReplayEvent)) {
        response.end();
        return;
      }

      const unsubscribe = broker.subscribe(taskId, (event) => {
        writeSseEvent(response, event);
        if (isTerminalEvent(event)) {
          unsubscribe();
          response.end();
        }
      });

      request.on("close", () => {
        unsubscribe();
      });
      return;
    }

    writeJson(response, 404, { message: "not found" });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(options.port ?? 0, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("adapter server address unavailable");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}
