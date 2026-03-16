import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/main";

describe("task flow", () => {
  it("creates a task and returns stream metadata", async () => {
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .post("/tasks")
      .send({
        input: { text: "帮我总结这份文档", fileIds: [] },
        preferredTone: "default",
        preferredLength: "medium"
      })
      .expect(201);

    expect(response.body.taskId).toBeTruthy();
    expect(response.body.streamUrl).toMatch(/\/tasks\/.+\/stream/);
    await app.close();
  });

  it("creates a follow-up task on the same session", async () => {
    const app = await createApp();
    const createResponse = await request(app.getHttpServer())
      .post("/tasks")
      .send({
        input: { text: "先帮我起草一封邮件", fileIds: [] },
        preferredTone: "default",
        preferredLength: "medium"
      })
      .expect(201);

    const followupResponse = await request(app.getHttpServer())
      .post(`/tasks/${createResponse.body.taskId}/followup`)
      .send({
        input: { text: "再把语气改得正式一点", fileIds: [] },
        preferredTone: "default",
        preferredLength: "medium"
      })
      .expect(201);

    expect(followupResponse.body.taskId).toBeTruthy();
    expect(followupResponse.body.taskId).not.toBe(createResponse.body.taskId);
    expect(followupResponse.body.sessionId).toBe(createResponse.body.sessionId);
    expect(followupResponse.body.streamUrl).toMatch(/\/tasks\/.+\/stream/);
    await app.close();
  });
});
