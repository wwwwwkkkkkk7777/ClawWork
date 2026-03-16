import type { GatewayFrame, GatewayRequest } from "@clawwork/openclaw-protocol";
import WebSocket from "ws";
import { mapGatewayError } from "./error-map";

type GatewayTaskInput = {
  requestId: string;
  message: string;
};

export async function sendTaskToGateway(url: string, input: GatewayTaskInput) {
  return await new Promise<{ runId: string }>((resolve, reject) => {
    const ws = new WebSocket(url);

    const cleanup = () => {
      ws.removeAllListeners();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };

    ws.on("message", (raw) => {
      const frame = JSON.parse(raw.toString()) as GatewayFrame;

      if (frame.type === "event" && frame.event === "connect.challenge") {
        const connectRequest: GatewayRequest = {
          type: "req",
          id: "connect-1",
          method: "connect",
          params: { role: "operator" }
        };
        const taskRequest: GatewayRequest = {
          type: "req",
          id: input.requestId,
          method: "chat.send",
          params: { message: input.message }
        };

        ws.send(JSON.stringify(connectRequest));
        ws.send(JSON.stringify(taskRequest));
        return;
      }

      if (frame.type === "res" && frame.id === input.requestId && frame.ok) {
        cleanup();
        resolve({ runId: frame.payload.runId ?? "" });
        return;
      }

      if (frame.type === "res" && frame.id === input.requestId && !frame.ok) {
        cleanup();
        const mapped = mapGatewayError(frame.error?.code ?? "UNKNOWN");
        reject(new Error(mapped.code));
      }
    });

    ws.on("error", (error) => {
      cleanup();
      reject(error);
    });
  });
}
