import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createAdapterServer } from "./server";

function loadWorkspaceEnv() {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "..", ".env"),
    resolve(process.cwd(), "..", "..", ".env")
  ];

  for (const envPath of candidates) {
    if (!existsSync(envPath)) {
      continue;
    }

    process.loadEnvFile(envPath);
    return;
  }
}

async function bootstrap() {
  loadWorkspaceEnv();
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  if (!gatewayUrl) {
    throw new Error("OPENCLAW_GATEWAY_URL is required");
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 3002;
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.ADAPTER_INTERNAL_TOKEN ||
      !process.env.MINIO_ENDPOINT ||
      !process.env.FILE_PARSER_URL ||
      !process.env.FILE_PARSER_INTERNAL_TOKEN)
  ) {
    throw new Error(
      "ADAPTER_INTERNAL_TOKEN, MINIO_ENDPOINT, FILE_PARSER_URL, and FILE_PARSER_INTERNAL_TOKEN are required in production"
    );
  }
  const server = await createAdapterServer({
    gatewayUrl,
    gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN,
    gatewayPassword: process.env.OPENCLAW_GATEWAY_PASSWORD,
    internalToken: process.env.ADAPTER_INTERNAL_TOKEN,
    allowedContentOrigin: process.env.MINIO_ENDPOINT,
    port,
    host: "0.0.0.0"
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
      service: "openclaw-adapter",
      event: "service_started",
      url: server.url
    })
  );
}

if (require.main === module) {
  void bootstrap().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        service: "openclaw-adapter",
        event: "bootstrap_failed",
        message: error instanceof Error ? error.message : "adapter failed to start"
      })
    );
    process.exitCode = 1;
  });
}
