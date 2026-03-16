# ClawWork

ClawWork is a monorepo for the mobile app, backend service baselines, shared contracts, and local infrastructure needed to connect a task-first office workflow to an OpenClaw Gateway.

## Workspace

- `apps/mobile`: Expo mobile shell
- `apps/mobile-api`: NestJS REST + SSE API
- `apps/task-router`: task classification rules
- `apps/openclaw-adapter`: Gateway transport baseline
- `apps/file-parser-worker`: file parsing worker baseline
- `packages/*`: shared config, auth, database, contracts, and protocol types

## Quick Start

1. `pnpm install`
2. `pnpm compose:up`
3. Copy `.env.example` to `.env` if you want a local env file, then set `OPENCLAW_GATEWAY_URL`
4. `pnpm smoke:backend`
5. `pnpm --filter @clawwork/mobile start`

Detailed local workflow lives in [local-run.md](/d:/Desktop/ClawWork/.worktrees/clawwork-foundation/docs/development/local-run.md).
