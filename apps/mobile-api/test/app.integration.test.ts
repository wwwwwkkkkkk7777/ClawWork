import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/main";

describe("mobile-api baseline", () => {
  it("returns health", async () => {
    const app = await createApp();

    await request(app.getHttpServer()).get("/health").expect(200);
    await app.close();
  });

  it("supports dev login", async () => {
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .post("/auth/dev-login")
      .send({ nickname: "Dev User", email: "dev@example.com" })
      .expect(200);

    expect(response.body.accessToken).toBeTruthy();
    await app.close();
  });
});
