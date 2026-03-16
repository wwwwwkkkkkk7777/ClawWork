import { describe, expect, it } from "vitest";
import { parseEnv } from "./index";

describe("parseEnv", () => {
  it("rejects missing DATABASE_URL", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it("parses required service config", () => {
    expect(
      parseEnv({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/clawwork",
        REDIS_URL: "redis://localhost:6379",
        MINIO_ENDPOINT: "http://localhost:9000",
        OPENCLAW_GATEWAY_URL: "ws://127.0.0.1:18789"
      }).NODE_ENV
    ).toBe("development");
  });
});
