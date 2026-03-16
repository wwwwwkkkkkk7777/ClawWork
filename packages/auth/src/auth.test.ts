import { describe, expect, it } from "vitest";
import { issueTokens, parseDevLoginPayload } from "./index";

describe("auth helpers", () => {
  it("creates access and refresh tokens", async () => {
    const tokens = await issueTokens({ sub: "user_1", email: "dev@example.com" });

    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
  });

  it("rejects empty dev login payload", () => {
    expect(() => parseDevLoginPayload({ nickname: "" })).toThrow(/nickname/);
  });
});
