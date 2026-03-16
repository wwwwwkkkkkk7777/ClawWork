import { Module } from "@nestjs/common";
import { AuthController } from "./auth/auth.controller";
import { FilesController } from "./files/files.controller";
import { HealthController } from "./health/health.controller";
import { HistoryController } from "./history/history.controller";
import { SettingsController } from "./settings/settings.controller";
import { TaskStreamController } from "./stream/task-stream.controller";
import { TasksController } from "./tasks/tasks.controller";
import { TasksService } from "./tasks/tasks.service";

@Module({
  controllers: [
    HealthController,
    AuthController,
    SettingsController,
    FilesController,
    TasksController,
    HistoryController,
    TaskStreamController
  ],
  providers: [TasksService]
})
export class AppModule {}
