import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/main";
import { bearer, login, uploadObject } from "./test-auth";

async function waitForTaskStatus(app: Awaited<ReturnType<typeof createApp>>, token: string, taskId: string) {
  for (let index = 0; index < 100; index += 1) {
    const response = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set("Authorization", bearer(token));
    if (response.body.status === "failed" || response.body.status === "completed") {
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("task did not reach a terminal status");
}

const originalAdapterUrl = process.env.OPENCLAW_ADAPTER_URL;

beforeEach(() => {
  delete process.env.OPENCLAW_ADAPTER_URL;
});

afterEach(() => {
  if (originalAdapterUrl) {
    process.env.OPENCLAW_ADAPTER_URL = originalAdapterUrl;
    return;
  }

  delete process.env.OPENCLAW_ADAPTER_URL;
});

describe("task flow", () => {
  it("cancels queued work and paginates then deletes owned history", async () => {
    const previousWorker = process.env.TASK_WORKER_ENABLED;
    const previousConcurrentLimit = process.env.USER_CONCURRENT_TASK_LIMIT;
    process.env.TASK_WORKER_ENABLED = "false";
    process.env.USER_CONCURRENT_TASK_LIMIT = "10";
    const app = await createApp();
    const token = await login(app, "task-lifecycle");
    try {
      const taskIds: string[] = [];
      for (const prompt of ["分页任务一", "分页任务二", "分页任务三"]) {
        const created = await request(app.getHttpServer())
          .post("/tasks")
          .set("Authorization", bearer(token))
          .send({ input: { text: prompt, fileIds: [] } })
          .expect(201);
        taskIds.push(created.body.taskId);
        await request(app.getHttpServer())
          .post(`/tasks/${created.body.taskId}/cancel`)
          .set("Authorization", bearer(token))
          .expect(201);
      }

      const firstPage = await request(app.getHttpServer())
        .get("/history/tasks?limit=2")
        .set("Authorization", bearer(token))
        .expect(200);
      expect(firstPage.body.items).toHaveLength(2);
      expect(firstPage.body.nextCursor).toBeTruthy();

      const secondPage = await request(app.getHttpServer())
        .get(`/history/tasks?limit=2&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`)
        .set("Authorization", bearer(token))
        .expect(200);
      expect(secondPage.body.items).toHaveLength(1);

      await request(app.getHttpServer())
        .delete(`/history/tasks/${taskIds[0]}`)
        .set("Authorization", bearer(token))
        .expect(200);
      await request(app.getHttpServer())
        .get(`/history/tasks/${taskIds[0]}`)
        .set("Authorization", bearer(token))
        .expect(404);
    } finally {
      await app.close();
      if (previousWorker === undefined) delete process.env.TASK_WORKER_ENABLED;
      else process.env.TASK_WORKER_ENABLED = previousWorker;
      if (previousConcurrentLimit === undefined) delete process.env.USER_CONCURRENT_TASK_LIMIT;
      else process.env.USER_CONCURRENT_TASK_LIMIT = previousConcurrentLimit;
    }
  });

  it("creates a task with file ids and returns stream metadata", async () => {
    const app = await createApp();
    const token = await login(app, "task-create");
    process.env.OPENCLAW_ADAPTER_URL = "";
    const content = Buffer.from("docx-body");
    const upload = await request(app.getHttpServer())
      .post("/files/upload-url")
      .set("Authorization", bearer(token))
      .send({
        filename: "summary.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: content.length
      })
      .expect(201);

    await uploadObject(
      upload.body.uploadUrl,
      content,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    await request(app.getHttpServer())
      .post("/files/complete")
      .set("Authorization", bearer(token))
      .send({
        fileId: upload.body.fileId,
        filename: "summary.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: content.length,
        storageKey: upload.body.storageKey
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post("/tasks")
      .set("Authorization", bearer(token))
      .send({
        input: { text: "帮我总结这份文档", fileIds: [upload.body.fileId] },
        preferredTone: "default",
        preferredLength: "medium"
      })
      .expect(201);

    expect(response.body.taskId).toBeTruthy();
    expect(response.body.initialStatus).toBe("queued");
    expect(response.body.streamUrl).toMatch(/\/tasks\/.+\/stream/);

    const taskResponse = await waitForTaskStatus(app, token, response.body.taskId);

    expect(taskResponse.body.files.map((file: { fileId: string }) => file.fileId)).toEqual([
      upload.body.fileId
    ]);
    expect(taskResponse.body.status).toBe("failed");

    const otherToken = await login(app, "task-other");
    await request(app.getHttpServer())
      .get(`/tasks/${response.body.taskId}`)
      .set("Authorization", bearer(otherToken))
      .expect(404);
    await request(app.getHttpServer())
      .post(`/tasks/${response.body.taskId}/regenerate`)
      .set("Authorization", bearer(otherToken))
      .expect(404);
    await request(app.getHttpServer())
      .post("/tasks")
      .set("Authorization", bearer(otherToken))
      .send({ input: { text: "steal file", fileIds: [upload.body.fileId] } })
      .expect(400);
    await app.close();
  });

  it("creates a follow-up task on the same session and keeps follow-up file ids", async () => {
    const app = await createApp();
    const token = await login(app, "task-followup");
    process.env.OPENCLAW_ADAPTER_URL = "";
    const createResponse = await request(app.getHttpServer())
      .post("/tasks")
      .set("Authorization", bearer(token))
      .send({
        input: { text: "先帮我起草一封邮件", fileIds: [] },
        preferredTone: "default",
        preferredLength: "medium"
      })
      .expect(201);

    const content = Buffer.from("col_a,col_b\n1,2\n");
    const upload = await request(app.getHttpServer())
      .post("/files/upload-url")
      .set("Authorization", bearer(token))
      .send({
        filename: "table.csv",
        mimeType: "text/csv",
        sizeBytes: content.length
      })
      .expect(201);

    await uploadObject(upload.body.uploadUrl, content, "text/csv");

    await request(app.getHttpServer())
      .post("/files/complete")
      .set("Authorization", bearer(token))
      .send({
        fileId: upload.body.fileId,
        filename: "table.csv",
        mimeType: "text/csv",
        sizeBytes: content.length,
        storageKey: upload.body.storageKey
      })
      .expect(201);

    const followupResponse = await request(app.getHttpServer())
      .post(`/tasks/${createResponse.body.taskId}/followup`)
      .set("Authorization", bearer(token))
      .send({
        input: {
          text: "再把语气改得正式一点",
          fileIds: [upload.body.fileId]
        },
        preferredTone: "default",
        preferredLength: "medium"
      })
      .expect(201);

    expect(followupResponse.body.taskId).toBeTruthy();
    expect(followupResponse.body.taskId).not.toBe(createResponse.body.taskId);
    expect(followupResponse.body.sessionId).toBe(createResponse.body.sessionId);
    expect(followupResponse.body.streamUrl).toMatch(/\/tasks\/.+\/stream/);

    const taskResponse = await request(app.getHttpServer())
      .get(`/tasks/${followupResponse.body.taskId}`)
      .set("Authorization", bearer(token))
      .expect(200);

    expect(taskResponse.body.files.map((file: { fileId: string }) => file.fileId)).toEqual([
      upload.body.fileId
    ]);
    await app.close();
  });
});
