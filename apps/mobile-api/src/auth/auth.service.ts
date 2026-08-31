import {
  hashPassword,
  hashRefreshToken,
  issueTokens,
  verifyPassword,
  verifyAccessToken,
  verifyRefreshToken
} from "@clawwork/auth";
import { Prisma, prisma } from "@clawwork/database";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import type { DevLoginDto, LoginDto, RegisterDto } from "./auth.dto";

const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  async register(input: RegisterDto) {
    const email = input.email.trim().toLowerCase();
    const nickname = input.nickname.trim();
    const credential = await hashPassword(input.password);

    try {
      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { email, nickname } });
        await tx.passwordCredential.create({
          data: { userId: created.id, ...credential }
        });
        await tx.userSettings.create({ data: { userId: created.id } });
        return created;
      });
      return this.createSession(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("email is already registered");
      }
      throw error;
    }
  }

  async login(input: LoginDto) {
    const email = input.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      include: { passwordCredential: true }
    });
    const credential = user?.passwordCredential;
    const now = new Date();

    if (!user || !credential || (credential.lockedUntil && credential.lockedUntil > now)) {
      throw new UnauthorizedException("email or password is incorrect");
    }

    const valid = await verifyPassword(
      input.password,
      credential.passwordHash,
      credential.passwordSalt
    );
    if (!valid) {
      const failedAttempts = credential.failedAttempts + 1;
      await prisma.passwordCredential.update({
        where: { userId: user.id },
        data: {
          failedAttempts,
          lockedUntil: failedAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null
        }
      });
      throw new UnauthorizedException("email or password is incorrect");
    }

    await prisma.passwordCredential.update({
      where: { userId: user.id },
      data: { failedAttempts: 0, lockedUntil: null }
    });
    return this.createSession(user);
  }

  async devLogin(input: DevLoginDto) {
    if (process.env.NODE_ENV === "production") {
      throw new ForbiddenException("development login is disabled");
    }
    const email = input.email?.trim().toLowerCase();
    const nickname = input.nickname.trim();
    const user = email
      ? await prisma.user.upsert({
          where: { email },
          update: { nickname },
          create: { email, nickname }
        })
      : ((await prisma.user.findFirst({ where: { email: null, nickname } })) ??
        (await prisma.user.create({ data: { nickname } })));

    await prisma.userSettings.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id }
    });

    return this.createSession(user);
  }

  async refresh(refreshToken: string) {
    let payload: ReturnType<typeof verifyRefreshToken>;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedException("refresh token is invalid or expired");
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const record = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });

    if (
      !record ||
      record.userId !== payload.sub ||
      record.revokedAt ||
      record.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException("refresh token is invalid or expired");
    }

    const claimed = await prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() }
    });
    if (claimed.count !== 1) {
      throw new UnauthorizedException("refresh token is invalid or expired");
    }

    return this.createSession(record.user);
  }

  async logout(userId: string, refreshToken: string) {
    await prisma.refreshToken.updateMany({
      where: {
        userId,
        tokenHash: hashRefreshToken(refreshToken),
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    });
  }

  async authenticate(accessToken: string) {
    let payload: ReturnType<typeof verifyAccessToken>;
    try {
      payload = verifyAccessToken(accessToken);
    } catch {
      throw new UnauthorizedException("access token is invalid or expired");
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException("user no longer exists");
    }

    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname
    };
  }

  private async createSession(user: {
    id: string;
    email: string | null;
    nickname: string;
  }) {
    const tokens = await issueTokens({
      sub: user.id,
      ...(user.email ? { email: user.email } : {})
    });

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashRefreshToken(tokens.refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS)
      }
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname
      }
    };
  }
}
