# Local Run

## Complete demo mode

Demo mode starts PostgreSQL, Redis, MinIO, migrations, the API, the isolated
file parser, the Adapter, and a deterministic Mock Gateway:

```sh
pnpm install --frozen-lockfile
pnpm demo:up
pnpm demo:smoke
```

No OpenClaw installation, Gateway token, or external model is needed. Normal
prompts return a streamed local response. Include `[artifact]` to exercise
result-file archival, `[fail]` to exercise failure and retry, or
`[disconnect]` to exercise Gateway disconnect handling. Demo services bind
only to loopback. Run `pnpm demo:down` when finished; volumes are preserved.

For a physical device, explicitly expose only the two required data-plane
ports before `pnpm demo:up`:

```powershell
$env:API_BIND_ADDRESS = "0.0.0.0"
$env:MINIO_BIND_ADDRESS = "0.0.0.0"
$env:DEMO_S3_PUBLIC_ENDPOINT = "http://<computer-lan-ip>:9000"
```

Then set `EXPO_PUBLIC_API_BASE_URL=http://<computer-lan-ip>:3001`. Keep
PostgreSQL, Redis, the MinIO console, Mock Gateway, Adapter, and parser on
loopback/internal networks, and use a trusted local network. Android emulators
can normally use `10.0.2.2` in place of the computer address; iOS simulators can
normally use `127.0.0.1`.

## Real Gateway mode

1. Run `pnpm install --frozen-lockfile`.
2. Start local infrastructure with `pnpm compose:up`.
3. Copy `.env.example` to `.env`, then run `pnpm prisma:generate` and `pnpm prisma:migrate:deploy`.
4. Use `DATABASE_URL=postgresql://postgres:postgres@localhost:54320/clawwork?schema=public`.
5. Start `pnpm --filter @clawwork/file-parser-worker start`. Keep port 3003
   private; the Adapter is its only client.
6. Start `pnpm --filter @clawwork/openclaw-adapter start` with
   `OPENCLAW_GATEWAY_URL` pointed at the real Gateway.
7. Set `OPENCLAW_ADAPTER_URL=http://127.0.0.1:3002` before starting `mobile-api`.
8. Set `S3_PUBLIC_ENDPOINT=http://localhost:9000`, the local MinIO credentials,
   and `S3_AUTO_CREATE_BUCKET=true`. File bytes are uploaded directly with the
   presigned URL returned by `POST /files/upload-url`.
9. Set `RESULT_ARTIFACT_ALLOWED_ORIGINS` to the local HTTP origin used by the
   Gateway for generated files. For push testing on a physical device, also set
   `EXPO_PUBLIC_EAS_PROJECT_ID` before starting Expo.

## Service Commands

- `pnpm --filter @clawwork/openclaw-adapter start`
- `pnpm --filter @clawwork/file-parser-worker start`
- `pnpm --filter @clawwork/mock-gateway start`
- `pnpm --filter @clawwork/mobile-api start`
- `pnpm --filter @clawwork/mobile-api test`
- `pnpm --filter @clawwork/task-router test`
- `pnpm --filter @clawwork/openclaw-adapter test`
- `pnpm --filter @clawwork/file-parser-worker test`
- `pnpm --filter @clawwork/mobile start`

## Smoke

Run `pnpm demo:smoke` after the demo stack is healthy. It verifies registration,
the persistent task queue, Mock Gateway streaming, result-file archival,
versioned result persistence, and history deletion.

Protected REST and SSE endpoints require `Authorization: Bearer <accessToken>`.
Register with `POST /auth/register`, sign in with `POST /auth/login`, and rotate
expired access tokens through `POST /auth/refresh`. `POST /auth/dev-login`
remains available only outside production for fixtures and local smoke tests.
