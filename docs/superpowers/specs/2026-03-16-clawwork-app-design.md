# ClawWork App Design Spec

## 1. Context

ClawWork is a mobile-first conversational office agent product built around OpenClaw Gateway as the control plane. The target experience is not a multi-tool office app, but a task handoff workflow where the user submits text, files, or later voice input and receives a usable first draft that can be iterated in-place.

This spec defines the approved MVP foundation architecture for a production-oriented repository skeleton. The first implementation priority is infrastructure correctness and clear service boundaries, not fastest demo speed.

## 2. Product Goal

The MVP foundation must support these product truths:

- Users start from a lightweight task entry point, not a feature grid.
- Tasks, not raw chat messages, are the primary domain object.
- Results are deliverables with versions, not just assistant replies.
- Follow-up edits must continue from the current task context.
- OpenClaw Gateway is the execution control plane, but not the product backend.

The repository skeleton must be able to evolve into a real production system without a later rewrite of the core service boundaries.

## 3. Scope Decisions

### 3.1 Approved Direction

The approved direction is:

- Full MVP foundation skeleton, not mobile-only
- Production foundation first
- Formal user/auth model with development login placeholder
- Containerized local development for backend services and infrastructure
- Real OpenClaw Gateway integration via configuration, not local Gateway orchestration
- Voice reserved in data model and UI only, not implemented end-to-end

### 3.2 Explicit Non-Goals For This Phase

The first skeleton will not include:

- Real SMS or email verification delivery
- Full voice recording and ASR loop
- Real outbound email sending
- Multi-agent orchestration
- Enterprise knowledge base features
- Third-party workflow integrations
- Local OpenClaw Gateway lifecycle management inside compose

## 4. Architecture Options Considered

### Option A: Strict Microservices From Day One

All backend responsibilities are deployed as separate services with full asynchronous communication patterns.

Pros:

- Maximum isolation
- Best future scaling posture

Cons:

- Highest implementation and local-dev complexity
- Too heavy for first skeleton delivery

### Option B: Monorepo With Independently Deployable Services

A single monorepo contains multiple backend apps, a mobile app, and shared packages. Runtime boundaries are real, but code sharing is centralized.

Pros:

- Preserves production boundaries
- Keeps developer workflow manageable
- Best fit for the approved scope

Cons:

- Requires shared contracts and package boundaries early

### Option C: Modular Monolith

A single main backend service owns most responsibilities, with limited extraction.

Pros:

- Fastest initial implementation

Cons:

- Conflicts with the approved production-first direction
- Creates likely rewrite cost later

### Chosen Approach

Option B is approved.

## 5. Repository Structure

The repository will use a monorepo with application-level separation and shared packages.

```text
apps/
  mobile/
  mobile-api/
  task-router/
  openclaw-adapter/
  file-parser-worker/

packages/
  shared-types/
  config/
  database/
  auth/
  openclaw-protocol/

infra/
  compose/

docs/
  superpowers/
    specs/
    plans/
```

### 5.1 apps/mobile

Expo React Native application. It uses the CasaOS mobile reference only as an engineering reference for project organization and mobile networking patterns, not as a product template.

Responsibilities:

- Login and session bootstrap
- Home task entry page
- Task conversation page
- Result delivery page
- History page
- Settings page
- File selection and upload initiation
- SSE consumption for task execution updates

### 5.2 apps/mobile-api

NestJS service exposed to the mobile client.

Responsibilities:

- Authentication and user APIs
- Session and task APIs
- File upload coordination
- History queries
- Settings APIs
- SSE endpoint for task streaming
- Permission checks, input validation, audit entry creation

### 5.3 apps/task-router

Service responsible for task classification and execution planning.

Responsibilities:

- Determine task type
- Determine output structure
- Determine target agent
- Decide whether file parsing is required
- Apply follow-up routing rules

The first version uses rules plus lightweight classification logic, not a complex planner.

### 5.4 apps/openclaw-adapter

Service responsible for all communication with OpenClaw Gateway.

Responsibilities:

- Maintain persistent WebSocket connection(s)
- Execute Gateway `connect`
- Manage session key and run mapping
- Send agent or chat requests
- Consume Gateway event streams
- Translate Gateway events and errors into business-facing task events

This is the only service allowed to know Gateway frame-level protocol details.

### 5.5 apps/file-parser-worker

Background worker for file parsing and extraction.

Responsibilities:

- Parse supported file formats
- Normalize extracted text
- Chunk or trim large content
- Persist parsing result references
- Emit parse completion/failure events

### 5.6 Shared Packages

- `packages/shared-types`: DTOs, event types, task/result schemas
- `packages/config`: environment schema and config loading
- `packages/database`: Prisma schema, migrations, seeds, db helpers
- `packages/auth`: JWT, refresh tokens, dev login provider, guards
- `packages/openclaw-protocol`: TypeScript Gateway protocol models and client helpers derived from OpenClaw reference material

## 6. Core Domain Model

Tasks are the primary object. Sessions are user-facing containers for task continuity. Results are versioned deliverables.

### 6.1 Main Tables

- `users`
- `refresh_tokens`
- `dev_login_identities`
- `user_settings`
- `app_sessions`
- `tasks`
- `task_inputs`
- `task_results`
- `files`
- `file_parse_jobs`
- `openclaw_session_bindings`
- `task_events`
- `audit_logs`

### 6.2 Domain Semantics

#### users

Formal product user records. Even with development login, the system uses real user entities from day one.

#### refresh_tokens

Persistent refresh token store for session rotation and logout invalidation.

#### dev_login_identities

Development-only login bootstrap mechanism. This is a temporary auth entry surface, not a different auth model.

#### user_settings

Stores default tone, default result length, default language, and future content preferences.

#### app_sessions

Represents a user-visible task conversation container. It stores title, current task linkage, status, and timestamps. It should not store Gateway protocol state directly.

#### tasks

Represents a single concrete office request such as document summary or email draft.

Planned MVP types:

- `document_summary`
- `email_draft`
- `meeting_minutes`
- `weekly_report`

#### task_inputs

Stores normalized task inputs and follow-up instructions. This prevents overloading `tasks` with mixed responsibility and preserves revision history.

#### task_results

Stores versioned deliverables. Each result includes:

- `output_text`
- `output_json`
- `style_type`
- `source_instruction`
- `version_no`

`output_json` is required for structure-aware rendering such as email cards or meeting-minutes cards.

#### files

Stores original uploaded file metadata and storage location.

#### file_parse_jobs

Stores parse lifecycle, retries, and parsing result pointers.

#### openclaw_session_bindings

Stores mapping between product-side tasks/sessions and OpenClaw execution context.

Key fields include:

- `task_id`
- `app_session_id`
- `openclaw_agent_id`
- `session_key`
- `run_id`
- `binding_status`

#### task_events

Stores normalized execution events for SSE replay, observability, and debugging.

#### audit_logs

Stores system and security-sensitive actions for operational review.

## 7. Service Communication Model

The system uses both synchronous and asynchronous communication.

### 7.1 Synchronous Communication

HTTP is used for low-latency request/response workflows:

- mobile -> mobile-api
- mobile-api -> task-router
- mobile-api -> openclaw-adapter when direct orchestration calls are needed

### 7.2 Asynchronous Communication

Redis + BullMQ is used for background execution and retriable workflows:

- file parsing jobs
- task execution requests
- result persistence jobs if needed
- retry and timeout compensation

### 7.3 Internal Event Topics

Initial event set:

- `file.parse.requested`
- `file.parse.completed`
- `task.created`
- `task.routing.completed`
- `task.execution.requested`
- `task.stream.delta`
- `task.completed`
- `task.failed`

This gives enough observability and workflow separation without introducing a heavier event bus.

## 8. OpenClaw Integration Design

### 8.1 Integration Posture

The system connects to an already running real OpenClaw Gateway using configuration. The repository does not own Gateway deployment in this phase.

### 8.2 Control Plane Boundary

OpenClaw is treated strictly as the control plane and execution source. Product-specific business logic remains in ClawWork services.

### 8.3 Execution Flow

1. Mobile client submits `POST /tasks`
2. `mobile-api` validates request and persists `tasks` and `task_inputs`
3. `mobile-api` obtains routing output from `task-router`
4. If parsing is needed, `file-parser-worker` processes file content first
5. Execution request is emitted internally
6. `openclaw-adapter` creates or reuses Gateway session context
7. `openclaw-adapter` sends `connect`, then submits the task to Gateway
8. Gateway returns accepted state
9. `openclaw-adapter` consumes stream events and emits normalized internal task events
10. `mobile-api` exposes those events to the client via SSE
11. Final structured result is written to `task_results`
12. Task/session records are updated

### 8.4 Hard Boundary Rules

- The mobile app must never connect directly to OpenClaw Gateway.
- `mobile-api` must not understand Gateway frames.
- Only `openclaw-adapter` can manage `sessionKey`, `runId`, `connect`, and Gateway event interpretation.
- `task-router` performs classification only and never manages transport state.

## 9. Mobile App Information Architecture

### 9.1 Approved Pages

- Home / New Task
- Task Conversation
- Result Delivery
- History
- Settings

### 9.2 Page Responsibilities

#### Home

Primary task entry point only.

Contains:

- Welcome/value prompt
- Example task cards
- Quick action tags
- Recent tasks
- Input bar
- Upload entry
- Reserved voice entry

It must not become a general dashboard.

#### Task Conversation

Primary task execution surface.

Contains:

- User inputs
- File cards
- Running state
- Result cards
- Follow-up input

This page owns the execution experience and iterative refinement loop.

#### Result Delivery

Focused reading and action surface for longer or higher-value outputs.

Contains:

- Full structured result rendering
- Copy action
- Tone switch
- Continue editing
- Regenerate

#### History

Task-oriented archive, not message transcript browser.

Contains:

- Task list
- Search
- Type filters
- Resume/continue actions

#### Settings

Lightweight user preference center.

Contains:

- Account
- Default tone/length/language
- Privacy references
- Feedback entry

### 9.3 Client State Model

Primary execution states:

- `idle`
- `uploading`
- `queued`
- `running`
- `completed`
- `failed`

These states should be shared conceptually across API and UI so the mobile app does not fragment execution behavior across multiple incompatible state systems.

## 10. Client and API Contract

### 10.1 Auth APIs

- `POST /auth/dev-login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /me`

Development login is a temporary entry point only. JWT and refresh token behavior must already match the long-term auth model.

### 10.2 Settings APIs

- `GET /settings`
- `PUT /settings`

### 10.3 File APIs

- `POST /files/upload-url`
- `POST /files/complete`
- `GET /files/:id`

Uploads should use object storage URLs and then confirm metadata through the API.

### 10.4 Task APIs

- `POST /tasks`
- `GET /tasks/:id`
- `GET /tasks/:id/versions`
- `POST /tasks/:id/followup`
- `POST /tasks/:id/regenerate`

Suggested `POST /tasks` request shape:

```json
{
  "sessionId": "optional-existing-session-id",
  "input": {
    "text": "帮我写一封客户跟进邮件",
    "fileIds": ["file_123"],
    "voicePlaceholder": null
  },
  "preferredTone": "formal",
  "preferredLength": "medium"
}
```

Suggested response shape:

```json
{
  "taskId": "task_123",
  "sessionId": "session_123",
  "streamUrl": "/tasks/task_123/stream",
  "initialStatus": "queued"
}
```

### 10.5 History APIs

- `GET /history/tasks`
- `GET /history/tasks/:id`

## 11. SSE Contract

The client subscribes only to business events, not Gateway events.

### 11.1 SSE Endpoint

- `GET /tasks/:id/stream`

### 11.2 Event Types

- `task.accepted`
- `task.stage.changed`
- `task.delta`
- `task.result.created`
- `task.completed`
- `task.failed`

Every event includes:

- `taskId`
- `sessionId`
- `runId`
- `timestamp`

Behavior:

- `task.delta` carries incremental content updates
- `task.result.created` carries normalized structured result payload
- `task.failed` carries business-safe error data only

If the SSE connection drops, the client must reconcile by fetching `GET /tasks/:id` instead of assuming failure.

## 12. File Handling

### 12.1 Supported Formats

Initial supported types:

- PDF
- DOCX
- TXT
- MD

### 12.2 Storage Rules

- Original file and parsed text are stored separately
- Agents consume parsed/cleaned text, not raw files directly
- Large inputs may be chunked, summarized, or truncated before execution

### 12.3 Execution Rule

When a task depends on file content, parsing must complete before task execution is dispatched unless the workflow explicitly supports staged execution later.

## 13. Voice Strategy

Voice is not implemented end-to-end in the first skeleton.

What is included:

- Reserved mobile UI entry point
- Data model placeholder
- API request field placeholder

What is excluded:

- Real recording workflow
- Upload pipeline for audio
- ASR provider integration
- Transcript-to-task closure

This preserves future expansion without blocking current foundation work.

## 14. Error Handling and Reliability

### 14.1 Error Families

Business-visible error families:

- `AUTH_*`
- `FILE_*`
- `TASK_*`
- `GATEWAY_*`

### 14.2 Translation Rules

- `openclaw-adapter` translates raw Gateway errors into `GATEWAY_*`
- `mobile-api` translates service/system failures into unified client-safe responses
- Raw OpenClaw error content is not exposed directly to the mobile app

### 14.3 Idempotency and Retry

- Execution requests must carry idempotency keys
- Background jobs must define retry policy and terminal failure behavior
- Result version writes must be guarded against duplication

## 15. Infrastructure and Local Development

### 15.1 Required Local Stack

The first compose stack should include:

- `postgres`
- `redis`
- `minio`
- `mobile-api`
- `task-router`
- `openclaw-adapter`
- `file-parser-worker`

The mobile app runs separately on the developer machine.

### 15.2 Infrastructure Rules

- Every service must expose a healthcheck
- Environment variables must be validated at startup
- Database migrations and seed logic must be explicit commands, not hidden in app boot
- OpenClaw Gateway host/token/session settings are provided via environment configuration

## 16. Testing Strategy

### 16.1 Unit Tests

Required areas:

- Task routing logic
- DTO validation
- Auth helpers
- Gateway error translation
- Result structure mapping

### 16.2 Integration Tests

Required flows:

- `mobile-api + postgres + redis`
- `openclaw-adapter + mock websocket gateway`
- `file-parser-worker + sample documents`

### 16.3 End-to-End Smoke Tests

Minimum smoke flows:

- Development login
- File upload metadata completion
- Task creation
- SSE accepted/delta/completed cycle
- Follow-up creates a new result version

### 16.4 Mobile Tests

Minimum required:

- Store/service unit tests
- Screen rendering tests for key states
- One happy-path smoke flow from home task entry to streamed result display

## 17. Delivery Criteria For The Skeleton

The first implementation is considered successful when:

- The monorepo structure exists with approved apps and shared packages
- The Expo mobile app starts
- Backend services start via compose
- Postgres, Redis, and MinIO are connected
- Development login works
- Task creation, file metadata registration, history retrieval, and settings APIs exist
- SSE task streaming works
- At least one real task can execute through a configured OpenClaw Gateway
- Voice remains reserved only, not implemented

## 18. Risks

Primary risks carried into implementation:

- Mobile state complexity during streamed results and version transitions
- Session mapping bugs between product task/session and OpenClaw execution state
- Parsing quality affecting downstream result quality
- Gateway dependency leaking into higher layers if adapter boundaries are not enforced
- Scope creep into real voice, outbound delivery, or multi-agent workflows too early

## 19. Implementation Direction

The next phase should create a detailed implementation plan for this approved design, then execute the skeleton in increments with verification at each stage.
