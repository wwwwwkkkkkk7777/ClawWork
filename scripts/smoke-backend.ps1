$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:55432/clawwork?schema=public"
$env:REDIS_URL = "redis://localhost:6379"
$env:MINIO_ENDPOINT = "http://localhost:9000"
$env:OPENCLAW_GATEWAY_URL = "ws://127.0.0.1:18791"

pnpm exec vitest run tests/smoke/backend-smoke.spec.ts
