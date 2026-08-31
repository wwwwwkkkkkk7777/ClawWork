# Architecture

ClawWork is a TypeScript monorepo with explicit trust boundaries.

```text
Expo mobile app
      |
      | HTTPS + bearer session
      v
Mobile API ---- PostgreSQL (users, sessions, tasks, files, results, events)
    |   \
    |    +---- Redis/BullMQ (durable execution queue and event fan-out)
    |    +---- S3/MinIO (input files and archived result artifacts)
    |
    | internal authenticated HTTP
    v
OpenClaw Adapter ===== persistent WebSocket ===== OpenClaw or Mock Gateway
    |
    | internal authenticated HTTP, raw bounded body
    v
File parser container -> one short-lived parser child per file
```

The API is the system of record. Queue entries and Redis event streams can be
reconstructed from PostgreSQL state. Clients upload directly to object storage
with short-lived presigned URLs, but the API validates ownership and completion
before a file can be attached to a task.

The Adapter owns Gateway protocol state, heartbeat, reconnect, cancellation,
timeout, and event normalization. Gateway output becomes durable only after the
API validates and persists it. Result files are downloaded only from configured
origins and copied to project-controlled object storage.

The parser is deliberately not a library call from the Adapter. Its service
accepts only authenticated requests, permits a small extension allowlist, and
spawns a memory- and time-bounded child. Production container restrictions add
a read-only filesystem, bounded tmpfs, dropped capabilities, PID/memory/CPU
limits, and an internal network.

See [the production deployment guide](deployment/production.md) for deployment
controls and [the security policy](../SECURITY.md) for reporting.
