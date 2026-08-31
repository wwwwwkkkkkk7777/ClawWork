import { prisma } from "@clawwork/database";
import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { TaskQueueService } from "../queue/task-queue.service";
import { S3StorageService } from "../storage/s3-storage.service";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(TaskQueueService) private readonly queue: TaskQueueService,
    @Inject(S3StorageService) private readonly storage: S3StorageService
  ) {}

  @Public()
  @Get()
  getHealth() {
    return { status: "ok", service: "mobile-api" };
  }

  @Public()
  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Public()
  @Get("ready")
  async ready() {
    const checks = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      this.queue.ready(),
      this.storage.ready()
    ]);
    if (checks.some((check) => check.status === "rejected")) {
      throw new ServiceUnavailableException({
        status: "not_ready",
        checks: {
          database: checks[0]?.status,
          redis: checks[1]?.status,
          objectStorage: checks[2]?.status
        }
      });
    }
    return { status: "ready", checks: { database: "ok", redis: "ok", objectStorage: "ok" } };
  }
}
