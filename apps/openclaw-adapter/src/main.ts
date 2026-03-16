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
  const server = await createAdapterServer({
    gatewayUrl,
    gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN,
    gatewayPassword: process.env.OPENCLAW_GATEWAY_PASSWORD,
    port
  });

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  console.log(`openclaw-adapter listening on ${server.url}`);
}

if (require.main === module) {
  void bootstrap();
}
