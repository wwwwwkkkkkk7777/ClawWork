import { promisify } from "node:util";
import crypto from "node:crypto";

const scryptAsync = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

export function resolvePasswordPepper(
  input: Record<string, string | undefined> = process.env
) {
  const pepper = input.PASSWORD_PEPPER?.trim();
  if (pepper) return pepper;
  if (input.NODE_ENV === "production") {
    throw new Error("PASSWORD_PEPPER is required in production");
  }
  return "clawwork-local-password-pepper";
}

export async function hashPassword(
  password: string,
  pepper = resolvePasswordPepper()
) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const derived = (await scryptAsync(`${password}${pepper}`, salt, KEY_LENGTH)) as Buffer;
  return { passwordHash: derived.toString("base64url"), passwordSalt: salt };
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
  passwordSalt: string,
  pepper = resolvePasswordPepper()
) {
  const expected = Buffer.from(passwordHash, "base64url");
  const actual = (await scryptAsync(
    `${password}${pepper}`,
    passwordSalt,
    expected.length
  )) as Buffer;
  return expected.length > 0 && crypto.timingSafeEqual(actual, expected);
}
