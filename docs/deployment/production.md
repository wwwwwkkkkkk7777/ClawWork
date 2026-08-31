# Production deployment

ClawWork ships a Docker Compose deployment with PostgreSQL, append-only Redis,
MinIO, the API, the OpenClaw adapter, an isolated file parser, and Prometheus.

1. Copy `infra/compose/.env.production.example` to a secure file outside version
   control and replace every placeholder. Passwords embedded in database and
   Redis URLs must be URL-safe.
2. Point `S3_PUBLIC_ENDPOINT` at the HTTPS endpoint that mobile clients can
   reach. The API uses the private `http://minio:9000` endpoint for Gateway
   downloads, so public and internal traffic remain separate.
3. Ensure the configured OpenClaw Gateway is reachable from the adapter. For a
   Gateway on the Docker host, use `ws://host.docker.internal:18789`.
   Set `RESULT_ARTIFACT_ALLOWED_ORIGINS` to the comma-separated HTTPS origins
   from which that Gateway serves generated files. Other origins and redirects
   are rejected before result bytes are archived into MinIO.
   Set a separate `FILE_PARSER_INTERNAL_TOKEN`; the parser has no public port
   and shares an internal-only network with the Adapter.
4. Configure request, daily-task, concurrent-task, and storage limits with the
   `RATE_LIMIT_*`, `USER_DAILY_TASK_LIMIT`, `USER_CONCURRENT_TASK_LIMIT`, and
   `USER_STORAGE_BYTES` variables. Stale uploads and unreferenced input files
   are removed according to the cleanup retention variables.
5. To enable mobile task notifications, set `EXPO_PUSH_ENABLED=true`, configure
   `EXPO_ACCESS_TOKEN` when Expo push access security is enabled, and provide
   `EXPO_PUBLIC_EAS_PROJECT_ID` to the Expo mobile build. Push registration is
   optional and never blocks task recovery.
6. Start the stack:

   ```sh
   docker compose --env-file /secure/path/clawwork.env \
     -f infra/compose/docker-compose.production.yml up -d --build
   ```

Database migrations run as a one-shot service before the API becomes healthy.
Readiness is exposed at `/health/ready`, liveness at `/health/live`, and
Prometheus metrics at `/metrics`. Prometheus is bound to `127.0.0.1:9090` by
default and authenticates to the API with `METRICS_TOKEN`. API and MinIO also
bind to loopback by default. Put TLS and request filtering in front of ports
3001 and 9000 before exposing them to the internet; `/metrics` should remain
private.

Untrusted PDF, DOCX, XLSX, CSV, text, and Markdown bytes are parsed only by the
`file-parser` service. Each request runs in a short-lived child process with
input, output, memory, process-count, and wall-clock limits. The container is
read-only, has no Linux capabilities, uses a bounded tmpfs, and is attached only
to an internal network. Keep these controls when translating the deployment to
Kubernetes or another platform.

Redis uses AOF and all stateful services use named volumes. Back up the
PostgreSQL and MinIO volumes; Redis is recoverable queue state, not the system
of record. Logs are structured JSON and include request IDs.

Task results are copied from an allowlisted Gateway origin into MinIO before a
`task.result.created` event is persisted. Result/history responses mint a fresh
short-lived download URL. Users can cancel queued or running work, page and
delete their history, and explicitly delete unreferenced uploads. The mobile app
rechecks active tasks on cold start and whenever it returns to the foreground.
