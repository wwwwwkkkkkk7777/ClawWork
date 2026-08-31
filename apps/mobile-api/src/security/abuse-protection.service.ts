import {
  HttpException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
  type OnModuleDestroy
} from "@nestjs/common";
import IORedis from "ioredis";
import type { AuthenticatedUser } from "../auth/current-user.decorator";

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

@Injectable()
export class AbuseProtectionService implements OnModuleDestroy {
  private readonly redis = new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    enableReadyCheck: true
  });

  async consumeRequest(identity: string, authenticated: boolean) {
    const limit = positiveInteger(
      authenticated
        ? process.env.RATE_LIMIT_AUTHENTICATED_PER_MINUTE
        : process.env.RATE_LIMIT_ANONYMOUS_PER_MINUTE,
      authenticated ? 120 : 30
    );
    const bucket = Math.floor(Date.now() / 60_000);
    const key = `clawwork:rate:${authenticated ? "user" : "ip"}:${identity}:${bucket}`;
    const count = Number(
      await this.redis.eval(
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n",
        1,
        key,
        65_000
      )
    );
    if (count > limit) {
      throw new HttpException("request rate limit exceeded", 429);
    }
  }

  async reserveDailyTask(userId: string) {
    const limit = positiveInteger(process.env.USER_DAILY_TASK_LIMIT, 100);
    const day = new Date().toISOString().slice(0, 10);
    const key = `clawwork:quota:tasks:${userId}:${day}`;
    const count = Number(
      await this.redis.eval(
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; if n>tonumber(ARGV[2]) then redis.call('DECR',KEYS[1]); return -1 end; return n",
        1,
        key,
        48 * 60 * 60,
        limit
      )
    );
    if (count < 0) {
      throw new HttpException("daily task quota exceeded", 429);
    }
  }

  async releaseDailyTask(userId: string) {
    const day = new Date().toISOString().slice(0, 10);
    const key = `clawwork:quota:tasks:${userId}:${day}`;
    await this.redis.eval(
      "local n=tonumber(redis.call('GET',KEYS[1]) or '0'); if n>0 then return redis.call('DECR',KEYS[1]) end; return 0",
      1,
      key
    );
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(AbuseProtectionService)
    private readonly abuseProtection: AbuseProtectionService
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      ip?: string;
      url?: string;
      socket?: { remoteAddress?: string };
    }>();
    const path = request.url?.split("?", 1)[0] ?? "";
    if (path.startsWith("/health/") || path === "/metrics") return true;

    const identity = request.user?.id ?? request.ip ?? request.socket?.remoteAddress ?? "unknown";
    try {
      await this.abuseProtection.consumeRequest(identity, Boolean(request.user));
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429) {
        context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>()
          .setHeader("Retry-After", "60");
      }
      throw error;
    }
    return true;
  }
}
