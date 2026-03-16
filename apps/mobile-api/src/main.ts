import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

export async function createApp() {
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
