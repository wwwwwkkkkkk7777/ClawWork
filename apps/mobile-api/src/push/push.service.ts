import { Injectable } from "@nestjs/common";
import { prisma } from "@clawwork/database";

type ExpoTicket = { status?: string; details?: { error?: string } };

@Injectable()
export class PushService {
  async register(userId: string, token: string, platform: string) {
    const registered = await prisma.pushToken.upsert({
      where: { token },
      update: { userId, platform, enabled: true, lastSeenAt: new Date() },
      create: { userId, token, platform }
    });
    const stale = await prisma.pushToken.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
      skip: 10,
      select: { id: true }
    });
    if (stale.length > 0) {
      await prisma.pushToken.deleteMany({
        where: { id: { in: stale.map(({ id }) => id) } }
      });
    }
    return registered;
  }

  async remove(userId: string, token: string) {
    await prisma.pushToken.updateMany({
      where: { userId, token },
      data: { enabled: false }
    });
  }

  async notifyTaskTerminal(input: {
    userId: string;
    taskId: string;
    status: "completed" | "failed" | "cancelled";
    title: string;
    message: string;
  }) {
    if (process.env.EXPO_PUSH_ENABLED?.toLowerCase() !== "true") return;
    const tokens = await prisma.pushToken.findMany({
      where: { userId: input.userId, enabled: true },
      select: { token: true },
      take: 100
    });
    if (tokens.length === 0) return;

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(process.env.EXPO_ACCESS_TOKEN
          ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
          : {})
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify(
        tokens.map(({ token }) => ({
          to: token,
          sound: "default",
          channelId: "tasks",
          title: input.title,
          body: input.message,
          data: { taskId: input.taskId, status: input.status }
        }))
      )
    });
    if (!response.ok) throw new Error(`Expo push request failed (${response.status})`);
    const payload = (await response.json()) as { data?: ExpoTicket[] };
    const invalidTokens = tokens
      .filter((_, index) => payload.data?.[index]?.details?.error === "DeviceNotRegistered")
      .map(({ token }) => token);
    if (invalidTokens.length > 0) {
      await prisma.pushToken.updateMany({
        where: { token: { in: invalidTokens } },
        data: { enabled: false }
      });
    }
  }
}
