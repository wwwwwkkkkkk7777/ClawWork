# ClawWork File Upload And Artifact Card Spec

## 1. Context

ClawWork already has a working mobile conversation shell, a task creation flow, SSE task streaming, and a real `mobile-api -> openclaw-adapter -> OpenClaw Gateway` execution path. It does not yet support real multi-format file upload in the mobile experience, and it does not yet render generated office files as first-class result cards inside the conversation stream.

The product documents under [doc/PRD.md](/d:/Desktop/ClawWork/.worktrees/clawwork-foundation/doc/PRD.md), [doc/技术方案草案.md](/d:/Desktop/ClawWork/.worktrees/clawwork-foundation/doc/技术方案草案.md), and [doc/页面原型说明文档.md](/d:/Desktop/ClawWork/.worktrees/clawwork-foundation/doc/页面原型说明文档.md) all expect:

- file upload as a primary task entry mode
- files to remain attached to tasks and follow-up turns
- AI output to become formal result cards rather than plain chat text
- exported office artifacts to be readable as deliverables and downloadable

This spec defines the first real implementation of those capabilities.

## 2. Approved Product Direction

The approved direction for this feature is:

- support mobile input files across common office formats
- keep file understanding in Gateway skills rather than ClawWork-side parsing
- render generated output files directly inside the conversation stream
- support download for generated `excel`, `pdf`, and `docx` artifacts
- preserve the current Doubao-style conversation experience instead of routing users into a separate document center

## 3. Scope

### 3.1 In Scope

- mobile file selection from home and conversation input areas
- file upload lifecycle UI
- file metadata creation and completion flow in `mobile-api`
- task creation and follow-up with `fileIds`
- adapter-side forwarding of file references to Gateway
- structured `artifact` result handling for `excel`, `pdf`, and `docx`
- in-stream output file cards with download actions

### 3.2 Out Of Scope

- ClawWork-side parsing of PDF/DOCX/XLSX/MD content
- document preview pages
- embedded spreadsheet preview rendering
- recent files center
- file version management
- artifact editing inside the app
- generalized file explorer UX

## 4. Input File Support

### 4.1 Supported Input Types

The first version supports:

- images: `jpg`, `jpeg`, `png`, `webp`
- documents: `pdf`, `doc`, `docx`, `md`, `txt`
- spreadsheets: `xls`, `xlsx`, `csv`

### 4.2 Responsibility Boundary

ClawWork is responsible for:

- selecting files on device
- uploading files to object storage
- persisting file metadata and task references
- showing file state to the user
- forwarding file identifiers and storage references into Gateway execution

Gateway skills are responsible for:

- reading file content
- deciding how to use attached files for the requested task
- generating output artifacts when requested

ClawWork must not introduce local parsing or format-specific extraction in this iteration.

## 5. Upload Flow

The approved upload flow is:

1. user taps the attachment button from home or conversation composer
2. mobile app opens the document picker
3. app requests `POST /files/upload-url`
4. app uploads the selected file to object storage using the returned upload target
5. app confirms upload with `POST /files/complete`
6. app stores the returned file object in local task draft state
7. when the user submits a message, `POST /tasks` or `POST /tasks/:id/followup` includes `input.fileIds`
8. `mobile-api` forwards file references through `openclaw-adapter` into Gateway execution

This flow applies to both first-turn tasks and follow-up turns.

## 6. Mobile Interaction Design

### 6.1 Entry Points

The mobile app must support file attachment in both:

- home screen input area
- conversation screen input area

### 6.2 Pending File Cards

After selection and before send, the app must show pending file cards above the composer.

Each pending file card must show:

- filename
- normalized file type label
- upload state: `uploading`, `uploaded`, or `failed`
- remove action

The user should be able to upload first and then type the task goal, matching the approved conversation-led workflow.

### 6.3 Failure Handling

The mobile UI must clearly expose:

- upload failure with retry guidance
- unsupported file type
- oversized file rejection
- download failure on generated artifacts

These should be surfaced as compact, user-readable task errors rather than raw transport errors.

## 7. Backend API Changes

Existing API surfaces remain valid, but their payloads must become richer.

### 7.1 `POST /files/upload-url`

Request must include:

- `filename`
- `mimeType`
- `sizeBytes`

Response must include:

- `fileId`
- `uploadUrl`
- `storageKey`

### 7.2 `POST /files/complete`

Response must return a durable file object containing:

- `fileId`
- `filename`
- `mimeType`
- `sizeBytes`
- `uploadedAt`
- `status`

### 7.3 `POST /tasks`

Continue using:

- `input.text`
- `input.fileIds`

### 7.4 `POST /tasks/:id/followup`

Must also support:

- `input.text`
- `input.fileIds`

This allows users to add more files during continued conversation, not just at task creation.

## 8. Gateway Contract

The first version assumes Gateway skills will produce structured file results instead of only natural-language links.

### 8.1 Required Artifact Result Shape

ClawWork expects a stable result payload equivalent to:

- `type: "artifact"`
- `artifact.kind: "excel" | "pdf" | "docx"`
- `artifact.fileName`
- `artifact.mimeType`
- `artifact.downloadUrl`
- `artifact.previewText`
- `artifact.sizeBytes` optional

### 8.2 Delivery Semantics

Gateway may continue to emit normal assistant text during execution, but the final deliverable artifact should arrive through a structured result event that ClawWork can convert into `task.result.created`.

ClawWork must not rely on scraping download URLs from free-form text.

## 9. In-Stream Output Artifact Cards

Generated `excel`, `pdf`, and `docx` outputs must appear directly in the conversation stream, not only in a dedicated result page.

Each artifact card must show:

- format icon or format badge
- file name
- short preview text
- a clear primary download action

Format-specific emphasis:

- `excel`: frame as a completed structured table or worksheet deliverable
- `pdf`: frame as a final document deliverable
- `docx`: frame as an editable office document deliverable

The card should visually feel more formal than a normal assistant bubble while still fitting the Doubao-style conversation layout.

## 10. Download Behavior

The first version should use the simplest reliable mobile behavior:

- tapping download opens the `downloadUrl` through system browser or system file handling

This is acceptable for the first version because the user requirement is download availability, not in-app file management.

Deep native download-center integration is explicitly deferred.

## 11. Result Rendering Model

The stream consumer already understands `task.result.created`, but the mobile app currently treats long-form output mostly as assistant text.

This feature introduces a distinct rendering path:

- plain text continues to render as assistant reply cards
- structured business results continue to evolve later
- `artifact` results render as dedicated artifact cards in the message stream

This should not break existing `task.delta` rendering or follow-up behavior.

## 12. Data Model Expectations

This feature needs durable metadata at least for:

- input file records
- uploaded object storage keys
- task-to-file relationships
- result artifact descriptors

The first iteration may continue to keep some runtime state in service memory if needed for speed, but the interface should already model files and artifacts as first-class objects rather than temporary strings.

## 13. Risks

### 13.1 Gateway Result Instability

If Gateway skills return inconsistent artifact structures, ClawWork will not be able to render stable download cards.

### 13.2 Mobile Picker Variance

Different Android devices and Expo document picker implementations may return inconsistent `mimeType`, filename, or URI values. The implementation must normalize these before upload.

### 13.3 Download UX Limits

The initial system/browser-based download flow is intentionally lightweight. It solves download availability, but not full file management.

## 14. Testing Expectations

This feature must be verified across:

- mobile upload flow UI state
- task creation with `fileIds`
- follow-up submission with additional `fileIds`
- adapter forwarding of file references
- `task.result.created` artifact mapping
- artifact card rendering in the conversation stream
- download action wiring

At minimum, tests should cover:

- mobile component and service tests for file attachment and artifact rendering
- `mobile-api` integration tests for richer file payloads and task linkage
- adapter tests for forwarding file references and mapping artifact results

## 15. Accepted First-Version Delivery

This feature is considered complete for the first version when:

- users can attach supported input file formats from mobile
- uploaded files are visible in draft state before send
- tasks and follow-ups carry `fileIds`
- Gateway receives file references
- `excel`, `pdf`, and `docx` output artifacts appear as in-stream cards
- artifact cards support download

This intentionally stops short of a full file workspace. The goal is a real office-task attachment and deliverable loop inside the existing ClawWork conversation product.
