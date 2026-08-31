$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:54320/clawwork?schema=public"
$env:REDIS_URL = "redis://localhost:6379"
$env:MINIO_ENDPOINT = "http://localhost:9000"
$env:S3_PUBLIC_ENDPOINT = "http://localhost:9000"
$env:S3_ACCESS_KEY = "minio"
$env:S3_SECRET_KEY = "minio123"
$env:S3_BUCKET = "clawwork"
$env:S3_AUTO_CREATE_BUCKET = "true"
$env:OPENCLAW_GATEWAY_URL = "ws://127.0.0.1:18791"
$env:JWT_ACCESS_SECRET = "local-smoke-access-secret-please-change"
$env:JWT_REFRESH_SECRET = "local-smoke-refresh-secret-please-change"
$env:PASSWORD_PEPPER = "local-smoke-password-pepper-change"
$env:TASK_QUEUE_ATTEMPTS = "1"

pnpm prisma:migrate:deploy
pnpm exec vitest run tests/smoke/backend-smoke.spec.ts
