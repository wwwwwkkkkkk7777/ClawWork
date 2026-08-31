# HTTP API overview

The default API origin is `http://127.0.0.1:3001`. JSON endpoints reject
unknown or invalid fields through the global validation pipeline. Except for
health, registration, login, refresh, and development login, requests require
`Authorization: Bearer <access-token>`. Development login is disabled when
`NODE_ENV=production`.

## Authentication

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | Create an account and session |
| POST | `/auth/login` | Sign in with email and password |
| POST | `/auth/refresh` | Rotate a refresh token |
| POST | `/auth/logout` | Revoke the current refresh token |
| GET | `/auth/me` or `/me` | Read the authenticated profile |

There is intentionally no email verification or password-reset endpoint.

## Files, tasks, and history

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/files/upload-url` | Reserve an owned file and receive a presigned upload URL |
| POST | `/files/complete` | Verify the uploaded object and mark it usable |
| GET/DELETE | `/files/:fileId` | Read metadata or delete an unreferenced owned file |
| POST | `/tasks` | Create and enqueue a task |
| POST | `/tasks/:id/followup` | Add a follow-up task in the same session |
| POST | `/tasks/:id/regenerate` | Retry as a new result version |
| POST | `/tasks/:id/cancel` | Cancel queued or running work |
| GET | `/tasks/active/current` | Recover active tasks after app resume |
| GET | `/tasks/:id` | Read owned task state and results |
| GET | `/tasks/:id/versions` | List persisted result versions |
| GET | `/tasks/:id/stream` | Resume the SSE event stream |
| GET | `/history/tasks` | Cursor-paginated owned history |
| GET/DELETE | `/history/tasks/:id` | Read or delete an owned history item |

SSE clients should send `Last-Event-ID` after reconnecting. Event IDs are
durable database IDs; replay continues after that ID and then switches to live
events. Terminal task states are `completed`, `failed`, and `cancelled`.

## User settings and push

| Method | Path | Purpose |
| --- | --- | --- |
| GET/PUT | `/settings` | Read or replace owned preferences |
| POST/DELETE | `/push/tokens` | Register or remove an Expo push token |

## Operations

`/health/live` reports process liveness and `/health/ready` checks required
dependencies. `/metrics` is Prometheus text format and requires the configured
metrics bearer token. Keep metrics, Adapter, parser, PostgreSQL, Redis, and
MinIO administration endpoints private.

Request and response contracts live beside controllers in `apps/mobile-api`
and shared event/file contracts live in `packages/shared-types`. This overview
is not a frozen compatibility guarantee before the first stable release.
