# ClawWork File Upload And Artifact Cards Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-format mobile file upload and in-stream downloadable `excel`/`pdf`/`docx` artifact cards so tasks can be created with attachments and return office deliverables inside the conversation flow.

**Architecture:** Keep ClawWork responsible for file selection, upload, metadata, task linkage, and result rendering, while keeping file understanding in Gateway skills. Introduce shared file and artifact contracts first, then thread those contracts through `mobile-api`, `openclaw-adapter`, and the Expo mobile client. Render generated artifacts as dedicated conversation items instead of plain assistant text.

**Tech Stack:** Expo React Native, TypeScript, Jest Expo, React Native Testing Library, NestJS mobile-api, Node openclaw-adapter, Vitest, Zod shared contracts, existing REST + SSE task flow

---

## File Structure

Existing files to reuse:

- `packages/shared-types/src/events.ts`: current task stream event schema, must gain typed artifact result support
- `packages/shared-types/src/index.ts`: shared-types barrel export
- `apps/mobile-api/src/files/files.controller.ts`: current upload-url and complete endpoints
- `apps/mobile-api/src/tasks/tasks.controller.ts`: current task create/follow-up DTO boundary
- `apps/mobile-api/src/tasks/tasks.service.ts`: current in-memory task/file records and adapter execute call
- `apps/mobile-api/test/tasks.integration.test.ts`: current create/follow-up API tests
- `apps/mobile-api/test/tasks.gateway.integration.test.ts`: current adapter-backed stream proxy test
- `apps/openclaw-adapter/src/server.ts`: current adapter HTTP execute endpoint and SSE stream broker
- `apps/openclaw-adapter/src/gateway-client.ts`: current websocket/HTTP gateway execution logic
- `apps/openclaw-adapter/test/gateway-client.test.ts`: current gateway-client contract tests
- `apps/mobile/src/components/InputBar.tsx`: current composer shell, needs attachment trigger support
- `apps/mobile/src/screens/HomeScreen.tsx`: current home-led entry screen
- `apps/mobile/src/screens/ConversationScreen.tsx`: current live chat screen
- `apps/mobile/src/services/tasks.ts`: current task create/follow-up REST client
- `apps/mobile/src/services/stream.ts`: current SSE subscription client
- `apps/mobile/src/store/taskStore.ts`: current draft/messages/status state
- `apps/mobile/src/test/conversation-live-chat.test.tsx`: current follow-up stream regression

New files to create:

- `packages/shared-types/src/files.ts`: shared file metadata and artifact schemas
- `apps/mobile-api/test/files.integration.test.ts`: richer upload-url/complete payload tests
- `apps/mobile/src/services/files.ts`: mobile file picker + upload REST client
- `apps/mobile/src/components/PendingFileCard.tsx`: selected/uploaded attachment chip-card
- `apps/mobile/src/components/ArtifactMessageCard.tsx`: in-stream file deliverable card
- `apps/mobile/src/test/file-attachments.test.tsx`: attachment draft UI proof
- `apps/mobile/src/test/artifact-message-card.test.tsx`: artifact card rendering and download proof

Dependencies to add during implementation:

- `apps/mobile/package.json`: add `expo-document-picker`

Keep file boundaries tight:

- contracts stay in `packages/shared-types/**`
- upload and task persistence stay in `apps/mobile-api/**`
- gateway mapping stays in `apps/openclaw-adapter/**`
- picker/upload/download UI stays in `apps/mobile/**`

Use `@superpowers:test-driven-development` for each task and `@superpowers:verification-before-completion` before claiming the feature complete.

## Chunk 1: Shared Contracts And Richer File APIs

### Task 1: Define shared file and artifact schemas

**Files:**
- Create: `packages/shared-types/src/files.ts`
- Modify: `packages/shared-types/src/events.ts`
- Modify: `packages/shared-types/src/index.ts`
- Modify: `packages/shared-types/src/contracts.test.ts`

- [ ] **Step 1: Write the failing shared-contract tests**

Add tests that assert:

- `FileRecordSchema` accepts `fileId`, `filename`, `mimeType`, `sizeBytes`, `uploadedAt`, `status`
- `ArtifactResultSchema` accepts `kind`, `fileName`, `mimeType`, `downloadUrl`, `previewText`
- `TaskStreamEventSchema` accepts `task.result.created` where `result.type === "artifact"`

- [ ] **Step 2: Run the shared-types test to verify it fails**

Run:

```bash
pnpm --filter @clawwork/shared-types test
```

Expected:

- failure because `files.ts` and artifact-aware event typing do not exist yet

- [ ] **Step 3: Implement the minimal shared schemas**

Add:

```ts
// packages/shared-types/src/files.ts
import { z } from "zod";

export const FileRecordSchema = z.object({
  fileId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  uploadedAt: z.string(),
  status: z.enum(["uploading", "uploaded", "failed"])
});

export const ArtifactResultSchema = z.object({
  type: z.literal("artifact"),
  artifact: z.object({
    kind: z.enum(["excel", "pdf", "docx"]),
    fileName: z.string(),
    mimeType: z.string(),
    downloadUrl: z.string().url(),
    previewText: z.string(),
    sizeBytes: z.number().int().nonnegative().optional()
  })
});
```

Update `events.ts` so `task.result.created.result` is a discriminated union that includes the artifact schema.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm --filter @clawwork/shared-types test
pnpm --filter @clawwork/shared-types build
```

Expected:

- contract tests pass
- shared-types compiles cleanly

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/files.ts packages/shared-types/src/events.ts packages/shared-types/src/index.ts packages/shared-types/src/contracts.test.ts
git commit -m "feat: add shared file and artifact contracts"
```

### Task 2: Expand `mobile-api` file payloads and task/file linkage

**Files:**
- Modify: `apps/mobile-api/src/files/files.controller.ts`
- Modify: `apps/mobile-api/src/tasks/tasks.controller.ts`
- Modify: `apps/mobile-api/src/tasks/tasks.service.ts`
- Create: `apps/mobile-api/test/files.integration.test.ts`
- Modify: `apps/mobile-api/test/tasks.integration.test.ts`

- [ ] **Step 1: Write failing API tests**

Add tests covering:

- `POST /files/upload-url` accepts `filename`, `mimeType`, `sizeBytes`
- `POST /files/complete` returns a full file record
- `POST /tasks` stores `fileIds`
- `POST /tasks/:id/followup` also stores `fileIds`

- [ ] **Step 2: Run the mobile-api tests to verify they fail**

Run:

```bash
pnpm --filter @clawwork/mobile-api exec vitest run test/files.integration.test.ts test/tasks.integration.test.ts --pool threads
```

Expected:

- failures because file endpoints currently only accept `filename`
- task records do not persist richer file metadata or follow-up attachments

- [ ] **Step 3: Implement the richer request/response shapes**

Update `TasksService` to:

- store file records with `mimeType`, `sizeBytes`, `status`
- generate upload responses with `storageKey`
- return complete file objects from `/files/complete`
- carry `input.fileIds` through task and follow-up records

Keep persistence in-memory for now, but make record shapes match the new shared types.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @clawwork/mobile-api exec vitest run test/files.integration.test.ts test/tasks.integration.test.ts --pool threads
pnpm --filter @clawwork/mobile-api build
```

Expected:

- file/task integration tests pass
- mobile-api compiles cleanly

- [ ] **Step 5: Commit**

```bash
git add apps/mobile-api/src/files/files.controller.ts apps/mobile-api/src/tasks/tasks.controller.ts apps/mobile-api/src/tasks/tasks.service.ts apps/mobile-api/test/files.integration.test.ts apps/mobile-api/test/tasks.integration.test.ts
git commit -m "feat: enrich mobile api file payloads"
```

## Chunk 2: Mobile Attachment Selection, Upload, And Draft State

### Task 3: Add mobile file picker and upload client

**Files:**
- Modify: `apps/mobile/package.json`
- Create: `apps/mobile/src/services/files.ts`
- Create: `apps/mobile/src/test/file-attachments.test.tsx`

- [ ] **Step 1: Write the failing upload service test**

Cover:

- normalizing a picked file into `{ filename, mimeType, sizeBytes, uri }`
- requesting `/files/upload-url`
- confirming `/files/complete`
- returning a durable file record for the task draft

- [ ] **Step 2: Run the mobile test to verify it fails**

Run:

```bash
pnpm --filter @clawwork/mobile test -- file-attachments.test.tsx
```

Expected:

- failure because there is no `files.ts` service or picker/upload workflow

- [ ] **Step 3: Implement the minimal picker/upload service**

Add `expo-document-picker` and implement `files.ts` with functions equivalent to:

```ts
export type PickedAttachment = {
  uri: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

export async function pickAttachments(): Promise<PickedAttachment[]> { /* document picker */ }
export async function uploadAttachment(file: PickedAttachment): Promise<FileRecord> { /* upload-url -> PUT -> complete */ }
```

Keep browser/system upload details inside this service so screens do not know about upload plumbing.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm --filter @clawwork/mobile test -- file-attachments.test.tsx
pnpm --filter @clawwork/mobile build
```

Expected:

- upload service test passes
- mobile TypeScript build passes

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/package.json apps/mobile/src/services/files.ts apps/mobile/src/test/file-attachments.test.tsx pnpm-lock.yaml
git commit -m "feat: add mobile file picker upload service"
```

### Task 4: Thread pending attachments into the home and conversation composers

**Files:**
- Create: `apps/mobile/src/components/PendingFileCard.tsx`
- Modify: `apps/mobile/src/components/InputBar.tsx`
- Modify: `apps/mobile/src/screens/HomeScreen.tsx`
- Modify: `apps/mobile/src/screens/ConversationScreen.tsx`
- Modify: `apps/mobile/src/store/taskStore.ts`
- Modify: `apps/mobile/src/services/tasks.ts`
- Modify: `apps/mobile/src/test/HomeScreen.test.tsx`
- Modify: `apps/mobile/src/test/conversation-live-chat.test.tsx`
- Modify: `apps/mobile/src/test/file-attachments.test.tsx`

- [ ] **Step 1: Extend the failing UI tests**

Add coverage for:

- tapping the attachment trigger
- showing pending file cards above the composer
- sending `fileIds` with `createTask`
- sending `fileIds` with `followUpTask`
- removing a pending file before send

- [ ] **Step 2: Run the mobile tests to verify they fail**

Run:

```bash
pnpm --filter @clawwork/mobile test -- HomeScreen.test.tsx
pnpm --filter @clawwork/mobile test -- conversation-live-chat.test.tsx
pnpm --filter @clawwork/mobile test -- file-attachments.test.tsx
```

Expected:

- failures because `InputBar` has no attachment callback and `taskStore` has no attachment state

- [ ] **Step 3: Implement draft attachment state and UI**

Update `taskStore` with:

- pending attachment list
- attachment add/remove/reset helpers
- message submission payload builder that includes `fileIds`

Update `InputBar` to accept:

- `onAttach`
- `attachDisabled`

Render `PendingFileCard` items above the input in home and conversation screens.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @clawwork/mobile test -- HomeScreen.test.tsx
pnpm --filter @clawwork/mobile test -- conversation-live-chat.test.tsx
pnpm --filter @clawwork/mobile test -- file-attachments.test.tsx
pnpm --filter @clawwork/mobile build
```

Expected:

- attachment state/UI tests pass
- mobile build passes

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/PendingFileCard.tsx apps/mobile/src/components/InputBar.tsx apps/mobile/src/screens/HomeScreen.tsx apps/mobile/src/screens/ConversationScreen.tsx apps/mobile/src/store/taskStore.ts apps/mobile/src/services/tasks.ts apps/mobile/src/test/HomeScreen.test.tsx apps/mobile/src/test/conversation-live-chat.test.tsx apps/mobile/src/test/file-attachments.test.tsx
git commit -m "feat: add mobile pending attachment workflow"
```

## Chunk 3: Adapter Forwarding And Artifact Result Mapping

### Task 5: Forward file references from `mobile-api` into the adapter execute request

**Files:**
- Modify: `apps/mobile-api/src/tasks/tasks.service.ts`
- Modify: `apps/openclaw-adapter/src/server.ts`
- Modify: `apps/mobile-api/test/tasks.gateway.integration.test.ts`

- [ ] **Step 1: Write the failing gateway integration test**

Extend the gateway integration test so that:

- creating a task with `fileIds` makes `mobile-api` send a `files` array to the adapter execute endpoint
- each forwarded file includes `fileId`, `filename`, `mimeType`, `sizeBytes`, `storageKey`

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @clawwork/mobile-api exec vitest run test/tasks.gateway.integration.test.ts --pool threads
```

Expected:

- failure because adapter execute payload currently only contains `taskId`, `sessionId`, and `message`

- [ ] **Step 3: Implement minimal adapter request enrichment**

Change `TasksService.requestGatewayExecution()` to send:

```ts
{
  taskId,
  sessionId,
  message,
  files: attachedFiles
}
```

and update adapter `ExecuteTaskPayload` to accept that array.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm --filter @clawwork/mobile-api exec vitest run test/tasks.gateway.integration.test.ts --pool threads
pnpm --filter @clawwork/mobile-api build
pnpm --filter @clawwork/openclaw-adapter build
```

Expected:

- mobile-api gateway integration test passes
- both services compile

- [ ] **Step 5: Commit**

```bash
git add apps/mobile-api/src/tasks/tasks.service.ts apps/openclaw-adapter/src/server.ts apps/mobile-api/test/tasks.gateway.integration.test.ts
git commit -m "feat: forward task file references to adapter"
```

### Task 6: Map Gateway artifact outputs into `task.result.created`

**Files:**
- Modify: `apps/openclaw-adapter/src/gateway-client.ts`
- Modify: `apps/openclaw-adapter/test/gateway-client.test.ts`
- Modify: `apps/mobile-api/src/stream/task-stream.controller.ts`

- [ ] **Step 1: Write the failing adapter test**

Add a test where Gateway emits a structured artifact payload and assert the adapter publishes:

- `task.result.created`
- `result.type === "artifact"`
- correct `artifact.kind`, `fileName`, `downloadUrl`

- [ ] **Step 2: Run the adapter test to verify it fails**

Run:

```bash
pnpm --filter @clawwork/openclaw-adapter exec vitest run test/gateway-client.test.ts --pool threads
```

Expected:

- failure because the adapter currently only emits `task.delta`, `task.stage.changed`, `task.completed`, and `task.failed`

- [ ] **Step 3: Implement the artifact mapping layer**

Inside `gateway-client.ts`, add a focused parser that converts the Gateway skill payload into a shared artifact result and emits:

```ts
{
  type: "task.result.created",
  taskId,
  sessionId,
  runId,
  timestamp,
  result: {
    type: "artifact",
    artifact: { ... }
  }
}
```

Keep this parser isolated so the exact Gateway payload can evolve without touching the rest of the task flow.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @clawwork/openclaw-adapter exec vitest run test/gateway-client.test.ts --pool threads
pnpm --filter @clawwork/openclaw-adapter build
pnpm --filter @clawwork/mobile-api build
```

Expected:

- adapter tests pass
- adapter and mobile-api still compile with the new event type

- [ ] **Step 5: Commit**

```bash
git add apps/openclaw-adapter/src/gateway-client.ts apps/openclaw-adapter/test/gateway-client.test.ts apps/mobile-api/src/stream/task-stream.controller.ts
git commit -m "feat: emit structured artifact results from gateway"
```

## Chunk 4: In-Stream Artifact Cards And Download Actions

### Task 7: Render artifact results as dedicated conversation cards

**Files:**
- Create: `apps/mobile/src/components/ArtifactMessageCard.tsx`
- Modify: `apps/mobile/src/store/taskStore.ts`
- Modify: `apps/mobile/src/screens/ConversationScreen.tsx`
- Create: `apps/mobile/src/test/artifact-message-card.test.tsx`
- Modify: `apps/mobile/src/test/conversation-live-chat.test.tsx`

- [ ] **Step 1: Write the failing artifact rendering tests**

Cover:

- `task.result.created` with `artifact.kind = "excel"` renders an artifact card instead of an assistant text card
- artifact card shows file name, preview text, and download button
- normal `task.delta` still renders as assistant text

- [ ] **Step 2: Run the mobile tests to verify they fail**

Run:

```bash
pnpm --filter @clawwork/mobile test -- artifact-message-card.test.tsx
pnpm --filter @clawwork/mobile test -- conversation-live-chat.test.tsx
```

Expected:

- failures because the store does not model artifact message items and the conversation screen only renders user/assistant text

- [ ] **Step 3: Implement the minimal artifact message path**

Refactor `ConversationMessage` into a discriminated union that can represent:

- `user`
- `assistant`
- `artifact`

Update `taskStore.applyStreamEvent()` so `task.result.created` appends an artifact message item and `ConversationScreen` branches to `ArtifactMessageCard`.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @clawwork/mobile test -- artifact-message-card.test.tsx
pnpm --filter @clawwork/mobile test -- conversation-live-chat.test.tsx
pnpm --filter @clawwork/mobile build
```

Expected:

- artifact rendering tests pass
- mobile build passes

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/ArtifactMessageCard.tsx apps/mobile/src/store/taskStore.ts apps/mobile/src/screens/ConversationScreen.tsx apps/mobile/src/test/artifact-message-card.test.tsx apps/mobile/src/test/conversation-live-chat.test.tsx
git commit -m "feat: render artifact cards in conversation stream"
```

### Task 8: Wire download actions and run end-to-end verification

**Files:**
- Modify: `apps/mobile/src/components/ArtifactMessageCard.tsx`
- Modify: `apps/mobile/src/test/artifact-message-card.test.tsx`
- Modify: `apps/mobile-api/test/tasks.gateway.integration.test.ts`

- [ ] **Step 1: Extend the failing tests for downloads**

Add tests that assert:

- pressing the artifact download button opens the artifact URL
- the proxied stream still contains both text events and `task.result.created`

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @clawwork/mobile test -- artifact-message-card.test.tsx
pnpm --filter @clawwork/mobile-api exec vitest run test/tasks.gateway.integration.test.ts --pool threads
```

Expected:

- failures because the card has no bound download action and the gateway integration fixture does not yet exercise artifact events

- [ ] **Step 3: Implement the minimal download wiring**

Use React Native `Linking.openURL()` from the card's primary action and update the gateway integration fixture to emit one artifact result plus normal stream lifecycle events.

- [ ] **Step 4: Run the full verification suite**

Run:

```bash
pnpm --filter @clawwork/shared-types test
pnpm --filter @clawwork/mobile-api exec vitest run test/files.integration.test.ts test/tasks.integration.test.ts test/tasks.gateway.integration.test.ts --pool threads
pnpm --filter @clawwork/openclaw-adapter exec vitest run test/gateway-client.test.ts --pool threads
pnpm --filter @clawwork/mobile test -- --runInBand
pnpm --filter @clawwork/shared-types build
pnpm --filter @clawwork/mobile-api build
pnpm --filter @clawwork/openclaw-adapter build
pnpm --filter @clawwork/mobile build
```

Expected:

- all targeted tests pass
- all touched packages build successfully

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/ArtifactMessageCard.tsx apps/mobile/src/test/artifact-message-card.test.tsx apps/mobile-api/test/tasks.gateway.integration.test.ts
git commit -m "feat: add downloadable artifact card actions"
```

## Execution Notes

- Read the official Expo SDK 52 docs for `expo-document-picker` before implementing the picker logic.
- Keep upload transport logic inside `apps/mobile/src/services/files.ts`; screens should only manage user intent and state transitions.
- Do not parse free-form assistant text into artifact cards. Only render cards from `task.result.created`.
- Do not add a separate result-center navigation for this feature. The approved surface is the conversation stream.
