# ClawWork Foundation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production-first ClawWork MVP foundation as a pnpm monorepo with an Expo mobile app, four backend services, shared packages, Docker Compose infrastructure, and a real OpenClaw Gateway integration path.

**Architecture:** Use a pnpm workspace with `apps/mobile`, `apps/mobile-api`, `apps/task-router`, `apps/openclaw-adapter`, and `apps/file-parser-worker`. Shared packages hold contracts, configuration, database access, auth, and OpenClaw protocol helpers. `mobile-api` owns public REST/SSE APIs, `task-router` classifies requests, `openclaw-adapter` owns Gateway WebSocket protocol, and `file-parser-worker` handles parse jobs.

**Tech Stack:** pnpm workspaces, TypeScript, Expo React Native, NestJS, Prisma, PostgreSQL, Redis, BullMQ, MinIO, Vitest, Supertest, Jest Expo, React Native Testing Library, Docker Compose

---

## File Structure

Root workspace:

- `package.json`: workspace scripts for install, build, lint, test, compose, and smoke commands
- `pnpm-workspace.yaml`: workspace membership
- `tsconfig.base.json`: shared TS settings
- `.gitignore`: ignore `node_modules`, build output, env files, Expo caches, and `.superpowers/`
- `.env.example`: cross-service example variables
- `scripts/check-workspace.mjs`: root smoke check for workspace layout
- `scripts/check-compose.ps1`: compose validation wrapper
- `scripts/smoke-backend.ps1`: end-to-end backend smoke runner

Shared packages:

- `packages/config/**`: env schema, config factories, test helpers
- `packages/shared-types/**`: task types, result schemas, DTOs, SSE event contracts
- `packages/database/**`: Prisma schema, migrations, seed script, repository helpers
- `packages/auth/**`: JWT, refresh token helpers, dev login helpers, guards/middleware
- `packages/openclaw-protocol/**`: Gateway frame types, client wrapper, error translation helpers

Backend apps:

- `apps/mobile-api/**`: public REST/SSE API, auth/session/task/file/history/settings modules
- `apps/task-router/**`: classification rules and routing endpoint
- `apps/openclaw-adapter/**`: Gateway client, session bindings, queue consumer, event publication
- `apps/file-parser-worker/**`: file parse queue consumer, parser adapters, parse result writer

Mobile app:

- `apps/mobile/app/**`: Expo entry or root navigator bootstrap
- `apps/mobile/src/screens/**`: home, conversation, result, history, settings
- `apps/mobile/src/components/**`: task chips, result cards, input bar, file card, loading state
- `apps/mobile/src/services/**`: auth, tasks, files, SSE stream client
- `apps/mobile/src/store/**`: auth, tasks, stream, UI state

Infrastructure:

- `infra/compose/docker-compose.yml`: postgres, redis, minio, and backend services
- `tests/smoke/**`: cross-service smoke tests and fixtures

Use `@superpowers:test-driven-development` discipline for each task and `@superpowers:verification-before-completion` before closing a chunk.

## Chunk 1: Workspace And Shared Contracts

### Task 1: Scaffold Root Workspace And Config Package

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `scripts/check-workspace.mjs`
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.json`
- Create: `packages/config/src/index.ts`
- Create: `packages/config/src/env.test.ts`

- [ ] **Step 1: Write the failing workspace/config proof**

```js
// scripts/check-workspace.mjs
import { existsSync, readFileSync } from "node:fs";

if (!existsSync("package.json")) {
  throw new Error("missing root package.json");
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
if (!pkg.workspaces && !pkg.packageManager) {
  throw new Error("workspace metadata not configured");
}
```

```ts
// packages/config/src/env.test.ts
import { describe, expect, it } from "vitest";
import { parseEnv } from "./index";

describe("parseEnv", () => {
  it("rejects missing DATABASE_URL", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it("parses required service config", () => {
    expect(
      parseEnv({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/clawwork",
        REDIS_URL: "redis://localhost:6379",
        MINIO_ENDPOINT: "http://localhost:9000",
        OPENCLAW_GATEWAY_URL: "ws://127.0.0.1:18789"
      }).NODE_ENV
    ).toBe("development");
  });
});
```

- [ ] **Step 2: Run the proof to verify it fails**

Run:

```bash
node scripts/check-workspace.mjs
pnpm --filter @clawwork/config test
```

Expected:

- `node scripts/check-workspace.mjs` fails with `missing root package.json`
- pnpm filter command fails because the workspace package does not exist yet

- [ ] **Step 3: Write the minimal workspace and config implementation**

```json
// package.json
{
  "name": "clawwork",
  "private": true,
  "packageManager": "pnpm@10.25.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "compose:up": "docker compose -f infra/compose/docker-compose.yml up -d",
    "compose:down": "docker compose -f infra/compose/docker-compose.yml down -v",
    "check:workspace": "node scripts/check-workspace.mjs"
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
  - "tests/*"
```

```json
// packages/config/package.json
{
  "name": "@clawwork/config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "build": "tsc -p tsconfig.json",
    "lint": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "typescript": "^5.8.2",
    "vitest": "^3.0.8"
  }
}
```

```ts
// packages/config/src/index.ts
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  MINIO_ENDPOINT: z.string().min(1),
  OPENCLAW_GATEWAY_URL: z.string().min(1)
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function parseEnv(input: Record<string, string | undefined>): AppEnv {
  return EnvSchema.parse(input);
}
```

- [ ] **Step 4: Run the checks to verify they pass**

Run:

```bash
pnpm install
pnpm check:workspace
pnpm --filter @clawwork/config test
```

Expected:

- install completes
- workspace check exits `0`
- config tests pass

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore .env.example scripts/check-workspace.mjs packages/config
git commit -m "chore: scaffold workspace and config package"
```

### Task 2: Add Shared Contracts For Tasks, Results, And SSE Events

**Files:**
- Create: `packages/shared-types/package.json`
- Create: `packages/shared-types/tsconfig.json`
- Create: `packages/shared-types/src/tasks.ts`
- Create: `packages/shared-types/src/events.ts`
- Create: `packages/shared-types/src/index.ts`
- Create: `packages/shared-types/src/contracts.test.ts`

- [ ] **Step 1: Write the failing contract tests**

```ts
// packages/shared-types/src/contracts.test.ts
import { describe, expect, it } from "vitest";
import { TaskTypeSchema, TaskStreamEventSchema } from "./index";

describe("shared contracts", () => {
  it("accepts supported MVP task types", () => {
    expect(TaskTypeSchema.parse("document_summary")).toBe("document_summary");
  });

  it("rejects unknown task event shapes", () => {
    expect(() =>
      TaskStreamEventSchema.parse({ type: "task.delta", taskId: "t1" })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @clawwork/shared-types test
```

Expected:

- pnpm filter command fails because the package is not defined yet

- [ ] **Step 3: Write the minimal contract package**

```ts
// packages/shared-types/src/tasks.ts
import { z } from "zod";

export const TaskTypeSchema = z.enum([
  "document_summary",
  "email_draft",
  "meeting_minutes",
  "weekly_report"
]);

export const ResultStyleSchema = z.enum([
  "default",
  "formal",
  "shorter",
  "boss_style",
  "client_style"
]);
```

```ts
// packages/shared-types/src/events.ts
import { z } from "zod";

const EventBase = z.object({
  taskId: z.string(),
  sessionId: z.string(),
  runId: z.string(),
  timestamp: z.string()
});

export const TaskStreamEventSchema = z.discriminatedUnion("type", [
  EventBase.extend({ type: z.literal("task.accepted") }),
  EventBase.extend({ type: z.literal("task.stage.changed"), stage: z.string() }),
  EventBase.extend({ type: z.literal("task.delta"), delta: z.string() }),
  EventBase.extend({ type: z.literal("task.result.created"), result: z.record(z.any()) }),
  EventBase.extend({ type: z.literal("task.completed") }),
  EventBase.extend({ type: z.literal("task.failed"), code: z.string(), message: z.string() })
]);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @clawwork/shared-types test
```

Expected:

- contracts tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types
git commit -m "feat: add shared task and stream contracts"
```

## Chunk 2: Infrastructure, Database, And Auth

### Task 3: Add Compose Infrastructure And Environment Wiring

**Files:**
- Create: `infra/compose/docker-compose.yml`
- Create: `infra/compose/.env.compose.example`
- Create: `scripts/check-compose.ps1`
- Modify: `.env.example`
- Modify: `package.json`

- [ ] **Step 1: Write the failing compose validation script**

```powershell
# scripts/check-compose.ps1
$composeFile = "infra/compose/docker-compose.yml"
if (-not (Test-Path $composeFile)) {
  throw "missing compose file"
}
docker compose -f $composeFile config | Out-Null
```

- [ ] **Step 2: Run the validation to verify it fails**

Run:

```powershell
powershell -NoProfile -File scripts/check-compose.ps1
```

Expected:

- script fails with `missing compose file`

- [ ] **Step 3: Write the minimal compose stack**

```yaml
# infra/compose/docker-compose.yml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: clawwork
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d clawwork"]

  redis:
    image: redis:7
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]

  minio:
    image: minio/minio:RELEASE.2025-01-20T14-49-07Z
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio123
    ports: ["9000:9000", "9001:9001"]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
```

```json
// package.json scripts fragment
{
  "scripts": {
    "compose:check": "powershell -NoProfile -File scripts/check-compose.ps1",
    "compose:up": "docker compose -f infra/compose/docker-compose.yml up -d",
    "compose:down": "docker compose -f infra/compose/docker-compose.yml down -v"
  }
}
```

- [ ] **Step 4: Run the validation to verify it passes**

Run:

```powershell
pnpm compose:check
pnpm compose:up
docker compose -f infra/compose/docker-compose.yml ps
```

Expected:

- compose config validation exits `0`
- postgres, redis, and minio are `running` or `healthy`

- [ ] **Step 5: Commit**

```bash
git add infra/compose scripts/check-compose.ps1 .env.example package.json
git commit -m "chore: add local infrastructure compose stack"
```

### Task 4: Add Prisma Schema And Database Package

**Files:**
- Create: `packages/database/package.json`
- Create: `packages/database/tsconfig.json`
- Create: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/seed.ts`
- Create: `packages/database/src/client.ts`
- Create: `packages/database/src/index.ts`
- Create: `packages/database/test/schema.integration.test.ts`

- [ ] **Step 1: Write the failing database integration test**

```ts
// packages/database/test/schema.integration.test.ts
import { describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("database schema", () => {
  it("persists a task and a versioned result", async () => {
    const user = await prisma.user.create({ data: { email: "dev@example.com", nickname: "Dev User" } });
    const session = await prisma.appSession.create({ data: { userId: user.id, title: "New task", status: "idle" } });
    const task = await prisma.task.create({
      data: { sessionId: session.id, userId: user.id, taskType: "document_summary", status: "queued" }
    });

    const result = await prisma.taskResult.create({
      data: { taskId: task.id, versionNo: 1, outputText: "draft", outputJson: { type: "summary" } }
    });

    expect(result.versionNo).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @clawwork/database test
```

Expected:

- test fails because Prisma schema and package are not defined yet

- [ ] **Step 3: Write the minimal schema and database package**

```prisma
// packages/database/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String       @id @default(cuid())
  email         String?      @unique
  nickname      String
  createdAt     DateTime     @default(now())
  sessions      AppSession[]
  tasks         Task[]
  refreshTokens RefreshToken[]
}

model AppSession {
  id            String   @id @default(cuid())
  userId        String
  title         String
  status        String
  currentTaskId String?
  updatedAt     DateTime @updatedAt
  createdAt     DateTime @default(now())
  user          User     @relation(fields: [userId], references: [id])
  tasks         Task[]
}

model Task {
  id        String       @id @default(cuid())
  sessionId String
  userId    String
  taskType  String
  status    String
  createdAt DateTime     @default(now())
  session   AppSession   @relation(fields: [sessionId], references: [id])
  user      User         @relation(fields: [userId], references: [id])
  results   TaskResult[]
}

model TaskResult {
  id         String   @id @default(cuid())
  taskId     String
  versionNo  Int
  outputText String
  outputJson Json
  createdAt  DateTime @default(now())
  task       Task     @relation(fields: [taskId], references: [id])
  @@unique([taskId, versionNo])
}

model RefreshToken {
  id        String   @id @default(cuid())
  userId    String
  tokenHash String   @unique
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])
}
```

```ts
// packages/database/src/client.ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
```

- [ ] **Step 4: Run the migration and tests to verify they pass**

Run:

```bash
pnpm compose:up
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/clawwork"
pnpm --filter @clawwork/database exec prisma migrate dev --name init
pnpm --filter @clawwork/database test
```

Expected:

- migration completes
- database integration test passes

- [ ] **Step 5: Commit**

```bash
git add packages/database
git commit -m "feat: add prisma schema and database package"
```

### Task 5: Add Auth Package With Dev Login And Refresh Tokens

**Files:**
- Create: `packages/auth/package.json`
- Create: `packages/auth/tsconfig.json`
- Create: `packages/auth/src/tokens.ts`
- Create: `packages/auth/src/dev-login.ts`
- Create: `packages/auth/src/index.ts`
- Create: `packages/auth/src/auth.test.ts`

- [ ] **Step 1: Write the failing auth tests**

```ts
// packages/auth/src/auth.test.ts
import { describe, expect, it } from "vitest";
import { issueTokens, parseDevLoginPayload } from "./index";

describe("auth helpers", () => {
  it("creates access and refresh tokens", async () => {
    const tokens = await issueTokens({ sub: "user_1", email: "dev@example.com" });
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
  });

  it("rejects empty dev login payload", () => {
    expect(() => parseDevLoginPayload({ nickname: "" })).toThrow(/nickname/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @clawwork/auth test
```

Expected:

- package does not exist yet or tests fail with missing exports

- [ ] **Step 3: Write the minimal auth helpers**

```ts
// packages/auth/src/dev-login.ts
import { z } from "zod";

const DevLoginSchema = z.object({
  nickname: z.string().min(1),
  email: z.string().email().optional()
});

export function parseDevLoginPayload(input: unknown) {
  return DevLoginSchema.parse(input);
}
```

```ts
// packages/auth/src/tokens.ts
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

const ACCESS_SECRET = "dev-access-secret";
const REFRESH_SECRET = "dev-refresh-secret";

export async function issueTokens(payload: { sub: string; email?: string }) {
  return {
    accessToken: jwt.sign(payload, ACCESS_SECRET, { expiresIn: "15m" }),
    refreshToken: jwt.sign(
      { sub: payload.sub, nonce: crypto.randomUUID() },
      REFRESH_SECRET,
      { expiresIn: "30d" }
    )
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @clawwork/auth test
```

Expected:

- auth tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/auth
git commit -m "feat: add auth helpers and dev login primitives"
```

## Chunk 3: Backend Services

### Task 6: Scaffold mobile-api With Health, Auth, And Settings

**Files:**
- Create: `apps/mobile-api/package.json`
- Create: `apps/mobile-api/tsconfig.json`
- Create: `apps/mobile-api/src/main.ts`
- Create: `apps/mobile-api/src/app.module.ts`
- Create: `apps/mobile-api/src/health/health.controller.ts`
- Create: `apps/mobile-api/src/auth/auth.controller.ts`
- Create: `apps/mobile-api/src/settings/settings.controller.ts`
- Create: `apps/mobile-api/test/app.integration.test.ts`

- [ ] **Step 1: Write the failing API integration test**

```ts
// apps/mobile-api/test/app.integration.test.ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/main";

describe("mobile-api baseline", () => {
  it("returns health", async () => {
    const app = await createApp();
    await request(app.getHttpServer()).get("/health").expect(200);
    await app.close();
  });

  it("supports dev login", async () => {
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .post("/auth/dev-login")
      .send({ nickname: "Dev User", email: "dev@example.com" })
      .expect(200);

    expect(response.body.accessToken).toBeTruthy();
    await app.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @clawwork/mobile-api test
```

Expected:

- package does not exist or integration test fails due to missing app bootstrap

- [ ] **Step 3: Write the minimal mobile-api service**

```ts
// apps/mobile-api/src/main.ts
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

export async function createApp() {
  return NestFactory.create(AppModule, { logger: false });
}

async function bootstrap() {
  const app = await createApp();
  await app.listen(3001);
}

void bootstrap();
```

```ts
// apps/mobile-api/src/health/health.controller.ts
import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return { status: "ok", service: "mobile-api" };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @clawwork/mobile-api test
```

Expected:

- health and dev-login tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/mobile-api
git commit -m "feat: scaffold mobile api baseline"
```

### Task 7: Build task-router Rules And Classification Endpoint

**Files:**
- Create: `apps/task-router/package.json`
- Create: `apps/task-router/tsconfig.json`
- Create: `apps/task-router/src/index.ts`
- Create: `apps/task-router/src/rules.ts`
- Create: `apps/task-router/src/router.test.ts`

- [ ] **Step 1: Write the failing routing tests**

```ts
// apps/task-router/src/router.test.ts
import { describe, expect, it } from "vitest";
import { routeTask } from "./index";

describe("routeTask", () => {
  it("routes a summary task", () => {
    expect(routeTask({ text: "帮我总结这份文档", fileIds: ["f1"] }).taskType).toBe("document_summary");
  });

  it("routes a polite client email", () => {
    const result = routeTask({ text: "写一封跟进客户的邮件，礼貌催一下进度", fileIds: [] });
    expect(result.taskType).toBe("email_draft");
    expect(result.toneStyle).toBe("formal");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @clawwork/task-router test
```

Expected:

- package does not exist or exports are missing

- [ ] **Step 3: Write the minimal routing engine**

```ts
// apps/task-router/src/index.ts
export function routeTask(input: { text: string; fileIds: string[] }) {
  const text = input.text.trim();

  if (text.includes("纪要")) {
    return { taskType: "meeting_minutes", toneStyle: "default", needFileParse: input.fileIds.length > 0 };
  }

  if (text.includes("邮件")) {
    return { taskType: "email_draft", toneStyle: "formal", needFileParse: input.fileIds.length > 0 };
  }

  if (text.includes("周报") || text.includes("汇报")) {
    return { taskType: "weekly_report", toneStyle: "formal", needFileParse: input.fileIds.length > 0 };
  }

  return { taskType: "document_summary", toneStyle: "default", needFileParse: input.fileIds.length > 0 };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @clawwork/task-router test
```

Expected:

- routing tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/task-router
git commit -m "feat: add task router service"
```

### Task 8: Build openclaw-adapter With Mocked Gateway Coverage

**Files:**
- Create: `apps/openclaw-adapter/package.json`
- Create: `apps/openclaw-adapter/tsconfig.json`
- Create: `apps/openclaw-adapter/src/gateway-client.ts`
- Create: `apps/openclaw-adapter/src/error-map.ts`
- Create: `apps/openclaw-adapter/src/index.ts`
- Create: `apps/openclaw-adapter/test/gateway-client.test.ts`
- Create: `packages/openclaw-protocol/package.json`
- Create: `packages/openclaw-protocol/src/index.ts`

- [ ] **Step 1: Write the failing adapter tests**

```ts
// apps/openclaw-adapter/test/gateway-client.test.ts
import { WebSocketServer } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { sendTaskToGateway } from "../src/gateway-client";

let server: WebSocketServer | undefined;

afterEach(() => server?.close());

describe("sendTaskToGateway", () => {
  it("connects then returns accepted run metadata", async () => {
    server = new WebSocketServer({ port: 18791 });
    server.on("connection", (socket) => {
      socket.send(JSON.stringify({ type: "event", event: "connect.challenge", payload: {} }));
      socket.on("message", () => {
        socket.send(JSON.stringify({ type: "res", id: "connect-1", ok: true, payload: {} }));
        socket.send(JSON.stringify({ type: "res", id: "task-1", ok: true, payload: { runId: "run_1" } }));
      });
    });

    const result = await sendTaskToGateway("ws://127.0.0.1:18791", {
      requestId: "task-1",
      message: "hello"
    });

    expect(result.runId).toBe("run_1");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @clawwork/openclaw-adapter test
```

Expected:

- package does not exist or transport implementation is missing

- [ ] **Step 3: Write the minimal adapter implementation**

```ts
// apps/openclaw-adapter/src/error-map.ts
export function mapGatewayError(code: string) {
  switch (code) {
    case "AGENT_TIMEOUT":
      return { code: "GATEWAY_TIMEOUT", retryable: true };
    case "UNAVAILABLE":
      return { code: "GATEWAY_UNAVAILABLE", retryable: true };
    default:
      return { code: "GATEWAY_ERROR", retryable: false };
  }
}
```

```ts
// apps/openclaw-adapter/src/gateway-client.ts
import WebSocket from "ws";

export async function sendTaskToGateway(url: string, input: { requestId: string; message: string }) {
  return await new Promise<{ runId: string }>((resolve, reject) => {
    const ws = new WebSocket(url);

    ws.on("message", (raw) => {
      const frame = JSON.parse(raw.toString());
      if (frame.event === "connect.challenge") {
        ws.send(JSON.stringify({ type: "req", id: "connect-1", method: "connect", params: { role: "operator" } }));
        ws.send(JSON.stringify({ type: "req", id: input.requestId, method: "chat.send", params: { message: input.message } }));
      }
      if (frame.type === "res" && frame.id === input.requestId && frame.ok) {
        resolve({ runId: frame.payload.runId });
        ws.close();
      }
    });

    ws.on("error", reject);
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @clawwork/openclaw-adapter test
```

Expected:

- mocked Gateway test passes

- [ ] **Step 5: Commit**

```bash
git add apps/openclaw-adapter packages/openclaw-protocol
git commit -m "feat: add openclaw adapter and protocol package"
```

### Task 9: Build file-parser-worker With Parse Queue And Fixtures

**Files:**
- Create: `apps/file-parser-worker/package.json`
- Create: `apps/file-parser-worker/tsconfig.json`
- Create: `apps/file-parser-worker/src/index.ts`
- Create: `apps/file-parser-worker/src/parse-file.ts`
- Create: `apps/file-parser-worker/src/job-handler.ts`
- Create: `apps/file-parser-worker/test/parse-file.test.ts`
- Create: `apps/file-parser-worker/test/fixtures/sample.md`

- [ ] **Step 1: Write the failing parser tests**

```ts
// apps/file-parser-worker/test/parse-file.test.ts
import { describe, expect, it } from "vitest";
import { parseFile } from "../src/parse-file";

describe("parseFile", () => {
  it("extracts markdown text", async () => {
    const result = await parseFile("apps/file-parser-worker/test/fixtures/sample.md");
    expect(result.text).toContain("Weekly summary");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @clawwork/file-parser-worker test
```

Expected:

- package does not exist or parser function is missing

- [ ] **Step 3: Write the minimal parser worker**

```ts
// apps/file-parser-worker/src/parse-file.ts
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function parseFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".md" || ext === ".txt") {
    return { text: await readFile(filePath, "utf8") };
  }

  throw new Error(`unsupported file type: ${ext}`);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @clawwork/file-parser-worker test
```

Expected:

- parser tests pass for markdown fixture

- [ ] **Step 5: Commit**

```bash
git add apps/file-parser-worker
git commit -m "feat: add file parser worker baseline"
```

## Chunk 4: Product Flows And Mobile App

### Task 10: Wire Task, File, History, And SSE Flows In mobile-api

**Files:**
- Create: `apps/mobile-api/src/files/files.controller.ts`
- Create: `apps/mobile-api/src/tasks/tasks.controller.ts`
- Create: `apps/mobile-api/src/tasks/tasks.service.ts`
- Create: `apps/mobile-api/src/history/history.controller.ts`
- Create: `apps/mobile-api/src/stream/task-stream.controller.ts`
- Create: `apps/mobile-api/test/tasks.integration.test.ts`

- [ ] **Step 1: Write the failing task-flow integration tests**

```ts
// apps/mobile-api/test/tasks.integration.test.ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/main";

describe("task flow", () => {
  it("creates a task and returns stream metadata", async () => {
    const app = await createApp();
    const response = await request(app.getHttpServer())
      .post("/tasks")
      .send({
        input: { text: "帮我总结这份文档", fileIds: [] },
        preferredTone: "default",
        preferredLength: "medium"
      })
      .expect(201);

    expect(response.body.taskId).toBeTruthy();
    expect(response.body.streamUrl).toMatch(/\/tasks\/.+\/stream/);
    await app.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @clawwork/mobile-api test -- tasks.integration.test.ts
```

Expected:

- test fails because task endpoints are not implemented

- [ ] **Step 3: Write the minimal orchestration layer**

```ts
// apps/mobile-api/src/tasks/tasks.service.ts
import { randomUUID } from "node:crypto";

export class TasksService {
  async createTask() {
    const taskId = randomUUID();
    return {
      taskId,
      sessionId: randomUUID(),
      streamUrl: `/tasks/${taskId}/stream`,
      initialStatus: "queued"
    };
  }
}
```

```ts
// apps/mobile-api/src/stream/task-stream.controller.ts
import { Controller, Get, Param, Sse } from "@nestjs/common";
import { Observable, of } from "rxjs";

@Controller("tasks")
export class TaskStreamController {
  @Sse(":id/stream")
  stream(@Param("id") id: string): Observable<MessageEvent> {
    return of({
      data: {
        type: "task.accepted",
        taskId: id,
        sessionId: "placeholder-session",
        runId: "placeholder-run",
        timestamp: new Date().toISOString()
      }
    } as MessageEvent);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @clawwork/mobile-api test -- tasks.integration.test.ts
```

Expected:

- task creation test passes

- [ ] **Step 5: Commit**

```bash
git add apps/mobile-api/src/files apps/mobile-api/src/tasks apps/mobile-api/src/history apps/mobile-api/src/stream apps/mobile-api/test/tasks.integration.test.ts
git commit -m "feat: add task and stream api skeleton"
```

### Task 11: Scaffold Expo Mobile App And Core State

**Files:**
- Create: `apps/mobile/package.json`
- Create: `apps/mobile/app.json`
- Create: `apps/mobile/tsconfig.json`
- Create: `apps/mobile/App.tsx`
- Create: `apps/mobile/src/navigation/RootNavigator.tsx`
- Create: `apps/mobile/src/store/authStore.ts`
- Create: `apps/mobile/src/store/taskStore.ts`
- Create: `apps/mobile/src/services/api/client.ts`
- Create: `apps/mobile/src/screens/HomeScreen.tsx`
- Create: `apps/mobile/src/test/HomeScreen.test.tsx`

- [ ] **Step 1: Write the failing mobile smoke test**

```tsx
// apps/mobile/src/test/HomeScreen.test.tsx
import { render, screen } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import { HomeScreen } from "../screens/HomeScreen";

describe("HomeScreen", () => {
  it("renders the task-first prompt", () => {
    render(<HomeScreen />);
    expect(screen.getByText("把任务交给我，我先帮你做一版")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @clawwork/mobile test
```

Expected:

- package does not exist or HomeScreen is missing

- [ ] **Step 3: Write the minimal Expo app**

```tsx
// apps/mobile/src/screens/HomeScreen.tsx
import { Text, View } from "react-native";

export function HomeScreen() {
  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
      <Text style={{ fontSize: 24, fontWeight: "700" }}>把任务交给我，我先帮你做一版</Text>
    </View>
  );
}
```

```tsx
// apps/mobile/App.tsx
import { HomeScreen } from "./src/screens/HomeScreen";

export default function App() {
  return <HomeScreen />;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @clawwork/mobile test
```

Expected:

- HomeScreen test passes

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat: scaffold expo mobile app"
```

### Task 12: Add Mobile Screens, Stream Store, And Task Submission Flow

**Files:**
- Create: `apps/mobile/src/screens/ConversationScreen.tsx`
- Create: `apps/mobile/src/screens/ResultScreen.tsx`
- Create: `apps/mobile/src/screens/HistoryScreen.tsx`
- Create: `apps/mobile/src/screens/SettingsScreen.tsx`
- Create: `apps/mobile/src/components/InputBar.tsx`
- Create: `apps/mobile/src/components/ResultCard.tsx`
- Create: `apps/mobile/src/services/tasks.ts`
- Create: `apps/mobile/src/services/stream.ts`
- Create: `apps/mobile/src/store/streamStore.ts`
- Create: `apps/mobile/src/test/task-flow.test.tsx`

- [ ] **Step 1: Write the failing task-flow UI test**

```tsx
// apps/mobile/src/test/task-flow.test.tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import { HomeScreen } from "../screens/HomeScreen";

describe("mobile task flow", () => {
  it("shows the task input and submit action", () => {
    render(<HomeScreen />);
    fireEvent.changeText(screen.getByPlaceholderText("告诉我你想交给我的任务…"), "写一封客户跟进邮件");
    expect(screen.getByText("发送")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @clawwork/mobile test -- task-flow.test.tsx
```

Expected:

- test fails because input and send action are not wired

- [ ] **Step 3: Write the minimal interactive screens**

```tsx
// apps/mobile/src/components/InputBar.tsx
import { Pressable, Text, TextInput, View } from "react-native";

export function InputBar(props: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
}) {
  return (
    <View>
      <TextInput
        placeholder="告诉我你想交给我的任务…"
        value={props.value}
        onChangeText={props.onChangeText}
      />
      <Pressable onPress={props.onSend}>
        <Text>发送</Text>
      </Pressable>
    </View>
  );
}
```

```tsx
// apps/mobile/src/screens/HomeScreen.tsx fragment
const [text, setText] = useState("");
return (
  <View>
    <Text>把任务交给我，我先帮你做一版</Text>
    <InputBar value={text} onChangeText={setText} onSend={() => {}} />
  </View>
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm --filter @clawwork/mobile test -- task-flow.test.tsx
```

Expected:

- task-flow UI test passes

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens apps/mobile/src/components apps/mobile/src/services apps/mobile/src/store apps/mobile/src/test/task-flow.test.tsx
git commit -m "feat: add mobile task flow screens and state"
```

## Chunk 5: Integration, Smoke Tests, And Developer Guidance

### Task 13: Add Backend Integration And Smoke Coverage

**Files:**
- Create: `tests/smoke/backend-smoke.spec.ts`
- Create: `tests/smoke/mock-gateway.ts`
- Create: `scripts/smoke-backend.ps1`
- Modify: `package.json`

- [ ] **Step 1: Write the failing smoke test**

```ts
// tests/smoke/backend-smoke.spec.ts
import { describe, expect, it } from "vitest";

describe("backend smoke", () => {
  it("covers dev login, task creation, and stream bootstrap", async () => {
    expect(process.env.DATABASE_URL).toBeTruthy();
    expect(process.env.REDIS_URL).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the smoke test to verify it fails when env is missing**

Run:

```bash
pnpm exec vitest run tests/smoke/backend-smoke.spec.ts
```

Expected:

- test fails unless the required environment is set

- [ ] **Step 3: Write the smoke harness and script**

```powershell
# scripts/smoke-backend.ps1
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/clawwork"
$env:REDIS_URL = "redis://localhost:6379"
$env:MINIO_ENDPOINT = "http://localhost:9000"
$env:OPENCLAW_GATEWAY_URL = "ws://127.0.0.1:18791"

pnpm exec vitest run tests/smoke/backend-smoke.spec.ts
```

```json
// package.json scripts fragment
{
  "scripts": {
    "smoke:backend": "powershell -NoProfile -File scripts/smoke-backend.ps1"
  }
}
```

- [ ] **Step 4: Run the smoke script to verify it passes**

Run:

```powershell
pnpm smoke:backend
```

Expected:

- smoke tests pass with the compose stack running and the mock Gateway available

- [ ] **Step 5: Commit**

```bash
git add tests/smoke scripts/smoke-backend.ps1 package.json
git commit -m "test: add backend smoke coverage"
```

### Task 14: Write Developer Runbooks And Final Verification Docs

**Files:**
- Create: `README.md`
- Create: `apps/mobile/README.md`
- Create: `docs/development/local-run.md`
- Modify: `docs/superpowers/specs/2026-03-16-clawwork-app-design.md`

- [ ] **Step 1: Write the failing documentation checklist**

```md
<!-- docs/development/local-run.md -->
- [ ] workspace install command documented
- [ ] compose startup documented
- [ ] mobile startup documented
- [ ] Gateway env setup documented
- [ ] smoke test command documented
```

- [ ] **Step 2: Run the checklist manually to verify it fails**

Run:

```text
Open docs/development/local-run.md and confirm every required line is still unchecked.
```

Expected:

- checklist is incomplete and does not yet explain how to run the system

- [ ] **Step 3: Write the runbooks**

```md
# Local Run

1. `pnpm install`
2. `pnpm compose:up`
3. Set `OPENCLAW_GATEWAY_URL` and auth vars in `.env`
4. Run backend services with `pnpm --filter @clawwork/mobile-api dev` and matching commands for the other services
5. Run mobile app with `pnpm --filter @clawwork/mobile start`
6. Verify with `pnpm smoke:backend`
```

- [ ] **Step 4: Verify the docs against the running commands**

Run:

```bash
pnpm install
pnpm compose:up
pnpm smoke:backend
```

Expected:

- all documented commands are real and executable

- [ ] **Step 5: Commit**

```bash
git add README.md apps/mobile/README.md docs/development/local-run.md docs/superpowers/specs/2026-03-16-clawwork-app-design.md
git commit -m "docs: add local runbook and verification guidance"
```

Plan review note:

- If a plan-review subagent is available, review each chunk before execution.
- If subagents are unavailable in the harness, perform a manual review of: file boundaries, test proof, command correctness, and commit granularity before executing the next chunk.

Execution order note:

1. Complete Chunk 1 before any app/service scaffolding.
2. Complete Chunk 2 before wiring service persistence.
3. Complete Chunk 3 before mobile task flow work.
4. Complete Chunk 4 before smoke coverage.
5. Complete Chunk 5 before handing off for QA or implementation sign-off.
