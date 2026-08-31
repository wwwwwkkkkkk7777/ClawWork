import crypto from "node:crypto";
import jwt from "jsonwebtoken";

export type TokenPayload = {
  sub: string;
  email?: string;
};

export type TokenSecrets = {
  accessSecret: string;
  refreshSecret: string;
};

const DEVELOPMENT_SECRETS: TokenSecrets = {
  accessSecret: "clawwork-local-access-secret",
  refreshSecret: "clawwork-local-refresh-secret"
};

export function resolveTokenSecrets(
  input: Record<string, string | undefined> = process.env
): TokenSecrets {
  const accessSecret = input.JWT_ACCESS_SECRET?.trim();
  const refreshSecret = input.JWT_REFRESH_SECRET?.trim();

  if (accessSecret && refreshSecret) {
    return { accessSecret, refreshSecret };
  }

  if (input.NODE_ENV === "production") {
    throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are required in production");
  }

  return DEVELOPMENT_SECRETS;
}

export async function issueTokens(
  payload: TokenPayload,
  secrets: TokenSecrets = resolveTokenSecrets()
) {
  return {
    accessToken: jwt.sign(payload, secrets.accessSecret, { expiresIn: "15m" }),
    refreshToken: jwt.sign(
      { sub: payload.sub, nonce: crypto.randomUUID() },
      secrets.refreshSecret,
      { expiresIn: "30d" }
    )
  };
}

export function verifyAccessToken(
  token: string,
  secrets: TokenSecrets = resolveTokenSecrets()
) {
  return jwt.verify(token, secrets.accessSecret) as TokenPayload & jwt.JwtPayload;
}

export function verifyRefreshToken(
  token: string,
  secrets: TokenSecrets = resolveTokenSecrets()
) {
  return jwt.verify(token, secrets.refreshSecret) as TokenPayload &
    jwt.JwtPayload & { nonce: string };
}

export function hashRefreshToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
