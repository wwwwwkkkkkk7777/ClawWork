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
});
