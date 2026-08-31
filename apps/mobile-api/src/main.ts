import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import "reflect-metadata";
import { parseEnv } from "@clawwork/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { JsonLogger } from "./observability/json-logger";
import { ObservabilityService } from "./observability/observability.service";
import { createRequestValidationPipe } from "./request-validation";

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

export async function createApp() {
  loadWorkspaceEnv();
  const env = parseEnv(process.env);
  const logger = new JsonLogger();
  const app = await NestFactory.create(AppModule, { logger });
  const origins = env.CORS_ORIGINS === "*"
    ? true
    : env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);
  app.enableCors({
    origin: origins,
    credentials: false,
    allowedHeaders: ["Content-Type", "Authorization", "Last-Event-ID", "X-Request-ID"],
    exposedHeaders: ["X-Request-ID"]
  });
  app.useGlobalPipes(createRequestValidationPipe());
  const observability = app.get(ObservabilityService);
  app.use(
    (
      request: { method: string; url?: string; headers: Record<string, string | string[] | undefined> },
      response: {
        statusCode: number;
        setHeader(name: string, value: string): void;
        once(event: string, listener: () => void): void;
      },
      next: () => void
    ) => {
      const started = process.hrtime.bigint();
      const requestId =
        (typeof request.headers["x-request-id"] === "string" && request.headers["x-request-id"]) ||
        randomUUID();
      response.setHeader("X-Request-ID", requestId);
      response.once("finish", () => {
        const seconds = Number(process.hrtime.bigint() - started) / 1_000_000_000;
        observability.recordRequest(request.method, response.statusCode, seconds);
        logger.log({
          event: "http_request_completed",
          requestId,
          method: request.method,
          path: request.url?.split("?", 1)[0],
          status: response.statusCode,
          durationMs: Math.round(seconds * 1_000)
        });
      });
      next();
    }
  );
  await app.init();
  return app;
}

async function bootstrap() {
  const app = await createApp();
  app.enableShutdownHooks();
  await app.listen(3001);
}

if (require.main === module) {
  void bootstrap().catch((error: unknown) => {
    new JsonLogger().error(
      error instanceof Error ? error.message : "mobile-api failed to start",
      error instanceof Error ? error.stack : undefined,
      "bootstrap"
    );
    process.exitCode = 1;
  });
}
