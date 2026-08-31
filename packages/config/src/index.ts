import { z } from "zod";

const BooleanEnv = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return value;
}, z.boolean());

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  MINIO_ENDPOINT: z.string().url(),
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_ACCESS_KEY: z.string().min(1).optional(),
  S3_SECRET_KEY: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(3).default("clawwork"),
  S3_FORCE_PATH_STYLE: BooleanEnv.default(true),
  S3_AUTO_CREATE_BUCKET: BooleanEnv.default(false),
  S3_PRESIGN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  OPENCLAW_GATEWAY_URL: z.string().url(),
  OPENCLAW_ADAPTER_URL: z.string().url().optional(),
  JWT_ACCESS_SECRET: z.string().min(24).optional(),
  JWT_REFRESH_SECRET: z.string().min(24).optional(),
  PASSWORD_PEPPER: z.string().min(24).optional(),
  ADAPTER_INTERNAL_TOKEN: z.string().min(24).optional(),
  TASK_QUEUE_NAME: z.string().min(1).default("clawwork-task-execution"),
  TASK_QUEUE_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  TASK_QUEUE_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  TASK_WORKER_ENABLED: BooleanEnv.default(true),
  REDIS_EVENTS_ENABLED: BooleanEnv.default(true),
  CORS_ORIGINS: z.string().default("*"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  METRICS_TOKEN: z.string().min(24).optional(),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().max(25 * 1024 * 1024).default(10 * 1024 * 1024),
  TASK_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30 * 60 * 1_000).default(120_000),
  MAX_RESULT_FILE_BYTES: z.coerce.number().int().positive().max(100 * 1024 * 1024).default(25 * 1024 * 1024),
  RESULT_ARTIFACT_ALLOWED_ORIGINS: z.string().optional(),
  STALE_UPLOAD_RETENTION_HOURS: z.coerce.number().int().min(1).max(24 * 365).default(24),
  UNREFERENCED_FILE_RETENTION_HOURS: z.coerce.number().int().min(1).max(24 * 365).default(7 * 24),
  FILE_CLEANUP_INTERVAL_MS: z.coerce.number().int().min(60_000).default(15 * 60_000),
  RATE_LIMIT_ANONYMOUS_PER_MINUTE: z.coerce.number().int().min(1).default(30),
  RATE_LIMIT_AUTHENTICATED_PER_MINUTE: z.coerce.number().int().min(1).default(120),
  USER_DAILY_TASK_LIMIT: z.coerce.number().int().min(1).default(100),
  USER_CONCURRENT_TASK_LIMIT: z.coerce.number().int().min(1).default(3),
  USER_STORAGE_BYTES: z.coerce.number().int().min(1).default(1024 * 1024 * 1024),
  EXPO_PUSH_ENABLED: BooleanEnv.default(false),
  EXPO_ACCESS_TOKEN: z.string().optional()
}).superRefine((env, context) => {
  if (
    env.NODE_ENV === "production" &&
    (!env.JWT_ACCESS_SECRET ||
      !env.JWT_REFRESH_SECRET ||
      !env.PASSWORD_PEPPER ||
      !env.ADAPTER_INTERNAL_TOKEN ||
      !env.S3_ACCESS_KEY ||
      !env.S3_SECRET_KEY)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "JWT, password, adapter, and S3 secrets are required in production",
      path: ["JWT_ACCESS_SECRET"]
    });
  }
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function parseEnv(input: Record<string, string | undefined>): AppEnv {
  return EnvSchema.parse(input);
}
