import { describe, expect, it } from "vitest";
import { hashPassword, issueTokens, parseDevLoginPayload, verifyPassword } from "./index";

describe("auth helpers", () => {
  it("creates access and refresh tokens", async () => {
    const tokens = await issueTokens({ sub: "user_1", email: "dev@example.com" });

    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
  });

  it("rejects empty dev login payload", () => {
    expect(() => parseDevLoginPayload({ nickname: "" })).toThrow(/nickname/);
  });

  it("hashes passwords with a random salt and verifies without exposing plaintext", async () => {
    const first = await hashPassword("correct horse battery staple", "test-pepper");
    const second = await hashPassword("correct horse battery staple", "test-pepper");

    expect(first.passwordHash).not.toBe("correct horse battery staple");
    expect(first.passwordHash).not.toBe(second.passwordHash);
    await expect(
      verifyPassword(
        "correct horse battery staple",
        first.passwordHash,
        first.passwordSalt,
        "test-pepper"
      )
    ).resolves.toBe(true);
    await expect(
      verifyPassword("wrong password", first.passwordHash, first.passwordSalt, "test-pepper")
    ).resolves.toBe(false);
  });
});
