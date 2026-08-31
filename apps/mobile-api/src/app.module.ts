import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthController, MeController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { FilesController } from "./files/files.controller";
import { HealthController } from "./health/health.controller";
import { HistoryController } from "./history/history.controller";
import { SettingsController } from "./settings/settings.controller";
import { TaskStreamController } from "./stream/task-stream.controller";
import { TaskEventHub } from "./stream/task-event-hub";
import { TasksController } from "./tasks/tasks.controller";
import { TasksService } from "./tasks/tasks.service";
import { SettingsService } from "./settings/settings.service";
import { S3StorageService } from "./storage/s3-storage.service";
import { TaskQueueService } from "./queue/task-queue.service";
import { MetricsController } from "./observability/metrics.controller";
import { ObservabilityService } from "./observability/observability.service";
import { AbuseProtectionService, RateLimitGuard } from "./security/abuse-protection.service";
import { PushController } from "./push/push.controller";
import { PushService } from "./push/push.service";

@Module({
  controllers: [
    HealthController,
    AuthController,
    MeController,
    SettingsController,
    FilesController,
    TasksController,
    HistoryController,
    TaskStreamController,
    MetricsController,
    PushController
  ],
  providers: [
    AuthService,
    SettingsService,
    S3StorageService,
    TaskQueueService,
    ObservabilityService,
    AbuseProtectionService,
    PushService,
    TaskEventHub,
    TasksService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard
    }
  ]
})
export class AppModule {}
