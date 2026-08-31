import { createMockGateway } from "./server";

async function bootstrap() {
  const server = await createMockGateway({
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 18_789),
    publicOrigin: process.env.MOCK_GATEWAY_PUBLIC_ORIGIN,
    responseDelayMs: Number(process.env.MOCK_GATEWAY_RESPONSE_DELAY_MS ?? 40)
  });

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      service: "mock-gateway",
      event: "service_started",
      httpUrl: server.httpUrl,
      wsUrl: server.wsUrl
    })
  );
}

void bootstrap().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      service: "mock-gateway",
      event: "bootstrap_failed",
      message: error instanceof Error ? error.message : "mock gateway failed to start"
    })
  );
  process.exitCode = 1;
});
