import { existsSync } from "node:fs";
import { resolve } from "node:path";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

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
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.init();
  return app;
}

async function bootstrap() {
  const app = await createApp();
  await app.listen(3001);
}

if (require.main === module) {
  void bootstrap();
}
