import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/main";

describe("mobile-api baseline", () => {
  it("returns health", async () => {
    const app = await createApp();

    await request(app.getHttpServer()).get("/health").expect(200);
    await request(app.getHttpServer()).get("/health/live").expect(200);
    await request(app.getHttpServer()).get("/health/ready").expect(200);
    await app.close();
  });

  it("protects and renders Prometheus metrics", async () => {
    const previousToken = process.env.METRICS_TOKEN;
    process.env.METRICS_TOKEN = "integration-metrics-token-123456";
    const app = await createApp();
    try {
      await request(app.getHttpServer()).get("/metrics").expect(401);
      const response = await request(app.getHttpServer())
        .get("/metrics")
        .set("Authorization", "Bearer integration-metrics-token-123456")
        .expect(200);
      expect(response.text).toContain("clawwork_http_requests_total");
      expect(response.text).toContain("clawwork_tasks");
    } finally {
      await app.close();
      if (previousToken) process.env.METRICS_TOKEN = previousToken;
      else delete process.env.METRICS_TOKEN;
    }
  });

  it("supports dev login", async () => {
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .post("/auth/dev-login")
      .send({ nickname: "Dev User", email: "dev@example.com" })
      .expect(200);

    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.refreshToken).toBeTruthy();

    await request(app.getHttpServer()).get("/auth/me").expect(401);
    const meResponse = await request(app.getHttpServer())
      .get("/me")
      .set("Authorization", `Bearer ${response.body.accessToken}`)
      .expect(200);
    expect(meResponse.body.email).toBe("dev@example.com");

    const refreshed = await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: response.body.refreshToken })
      .expect(200);
    expect(refreshed.body.refreshToken).not.toBe(response.body.refreshToken);
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: response.body.refreshToken })
      .expect(401);
    await app.close();
  });

  it("registers and signs in with an email and password", async () => {
    const app = await createApp();
    const email = `formal-${process.pid}-${Date.now()}@example.com`;
    const registered = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ email, password: "a secure password 123", nickname: "Formal User" })
      .expect(201);
    expect(registered.body.accessToken).toBeTruthy();

    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password: "wrong password" })
      .expect(401);
    const loggedIn = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: email.toUpperCase(), password: "a secure password 123" })
      .expect(200);
    expect(loggedIn.body.user.email).toBe(email);
    await app.close();
  });
});
