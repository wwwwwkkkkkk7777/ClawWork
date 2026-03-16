# Local Run

- [x] workspace install command documented
- [x] compose startup documented
- [x] mobile startup documented
- [x] Gateway env setup documented
- [x] smoke test command documented

## Backend And Infra

1. Run `pnpm install`
2. Start local infra with `pnpm compose:up`
3. Use `DATABASE_URL=postgresql://postgres:postgres@localhost:55432/clawwork?schema=public`
4. Start `pnpm --filter @clawwork/openclaw-adapter start` with `OPENCLAW_GATEWAY_URL` pointed at the real Gateway
5. Set `OPENCLAW_ADAPTER_URL=http://127.0.0.1:3002` before starting `mobile-api`

## Service Commands

- `pnpm --filter @clawwork/openclaw-adapter start`
- `pnpm --filter @clawwork/mobile-api start`
- `pnpm --filter @clawwork/mobile-api test`
- `pnpm --filter @clawwork/task-router test`
- `pnpm --filter @clawwork/openclaw-adapter test`
- `pnpm --filter @clawwork/file-parser-worker test`
- `pnpm --filter @clawwork/mobile start`

## Smoke

Run `pnpm smoke:backend` after the compose stack is up. The script sets the local Postgres, Redis, MinIO, and Gateway env values and verifies dev login plus task creation through `mobile-api`.
