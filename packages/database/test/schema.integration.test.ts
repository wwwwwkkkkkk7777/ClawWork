import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("database schema", () => {
  beforeEach(async () => {
    await prisma.taskResult.deleteMany();
    await prisma.taskEvent.deleteMany();
    await prisma.taskFile.deleteMany();
    await prisma.task.deleteMany();
    await prisma.file.deleteMany();
    await prisma.appSession.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists a task and a versioned result", async () => {
    const user = await prisma.user.create({
      data: { email: "dev@example.com", nickname: "Dev User" }
    });
    const session = await prisma.appSession.create({
      data: { userId: user.id, title: "New task", status: "idle" }
    });
    const task = await prisma.task.create({
      data: {
        sessionId: session.id,
        userId: user.id,
        taskType: "document_summary",
        status: "queued",
        inputText: "Summarize the document",
        preferredTone: "default",
        preferredLength: "medium"
      }
    });
    const result = await prisma.taskResult.create({
      data: {
        taskId: task.id,
        sessionId: session.id,
        versionNo: 1,
        outputText: "draft",
        outputJson: { type: "summary" }
      }
    });

    expect(result.versionNo).toBe(1);
  });
});
