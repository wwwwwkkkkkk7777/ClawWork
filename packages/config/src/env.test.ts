import { describe, expect, it } from "vitest";
import { parseEnv } from "./index";

describe("parseEnv", () => {
  it("rejects missing DATABASE_URL", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it("parses required service config", () => {
    const env = parseEnv({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://postgres:postgres@localhost:55432/clawwork?schema=public",
        REDIS_URL: "redis://localhost:6379",
        MINIO_ENDPOINT: "http://localhost:9000",
        OPENCLAW_GATEWAY_URL: "ws://127.0.0.1:18789",
        TASK_WORKER_ENABLED: "false",
        S3_AUTO_CREATE_BUCKET: "false"
      });
    expect(env.NODE_ENV).toBe("development");
    expect(env.TASK_WORKER_ENABLED).toBe(false);
    expect(env.S3_AUTO_CREATE_BUCKET).toBe(false);
  });
});
