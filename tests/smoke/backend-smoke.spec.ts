import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../apps/mobile-api/src/main";

let app: Awaited<ReturnType<typeof createApp>>;

describe("backend smoke", () => {
  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("covers env, dev login, task creation, and stream bootstrap", async () => {
    expect(process.env.DATABASE_URL).toBeTruthy();
    expect(process.env.REDIS_URL).toBeTruthy();
    expect(process.env.MINIO_ENDPOINT).toBeTruthy();
    expect(process.env.OPENCLAW_GATEWAY_URL).toBeTruthy();

    const loginResponse = await request(app.getHttpServer())
      .post("/auth/dev-login")
      .send({ nickname: "Smoke User", email: "smoke@example.com" })
      .expect(200);

    expect(loginResponse.body.accessToken).toBeTruthy();

    const taskResponse = await request(app.getHttpServer())
      .post("/tasks")
      .send({
        input: { text: "帮我总结这份文档", fileIds: [] },
        preferredTone: "default",
        preferredLength: "medium"
      })
      .expect(201);

    expect(taskResponse.body.taskId).toBeTruthy();
    expect(taskResponse.body.streamUrl).toMatch(/\/tasks\/.+\/stream/);
  });
});
