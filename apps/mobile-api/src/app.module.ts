import { Module } from "@nestjs/common";
import { AuthController } from "./auth/auth.controller";
import { HealthController } from "./health/health.controller";
import { SettingsController } from "./settings/settings.controller";

@Module({
  controllers: [HealthController, AuthController, SettingsController]
})
export class AppModule {}
