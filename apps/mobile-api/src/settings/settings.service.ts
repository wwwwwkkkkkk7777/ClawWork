import { prisma } from "@clawwork/database";
import { Injectable } from "@nestjs/common";
import type { UpdateSettingsDto } from "./settings.dto";

@Injectable()
export class SettingsService {
  getSettings(userId: string) {
    return prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId }
    });
  }

  updateSettings(userId: string, input: UpdateSettingsDto) {
    return prisma.userSettings.upsert({
      where: { userId },
      update: input,
      create: { userId, ...input }
    });
  }
}
