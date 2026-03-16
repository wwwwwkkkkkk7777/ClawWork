import crypto from "node:crypto";
import jwt from "jsonwebtoken";

const ACCESS_SECRET = "dev-access-secret";
const REFRESH_SECRET = "dev-refresh-secret";

type TokenPayload = {
  sub: string;
  email?: string;
};

export async function issueTokens(payload: TokenPayload) {
  return {
    accessToken: jwt.sign(payload, ACCESS_SECRET, { expiresIn: "15m" }),
    refreshToken: jwt.sign(
      { sub: payload.sub, nonce: crypto.randomUUID() },
      REFRESH_SECRET,
      { expiresIn: "30d" }
    )
  };
}
