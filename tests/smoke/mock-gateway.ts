import { WebSocketServer } from "ws";

export function startMockGateway(port: number) {
  const server = new WebSocketServer({ port });

  server.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "event", event: "connect.challenge", payload: {} }));
    socket.on("message", (raw) => {
      const frame = JSON.parse(raw.toString()) as { id?: string; method?: string };

      if (frame.method === "connect") {
        socket.send(JSON.stringify({ type: "res", id: frame.id, ok: true, payload: {} }));
      }

      if (frame.method === "chat.send") {
        socket.send(
          JSON.stringify({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { runId: "smoke-run-1" }
          })
        );
      }
    });
  });

  return server;
}
