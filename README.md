# ClawWork

ClawWork is an AGPL-3.0-licensed, self-hostable workspace for turning mobile requests and files into durable, traceable tasks. It includes an Expo client, API, persistent queue, isolated document parser, object storage, and an OpenClaw Gateway bridge.

> ClawWork is under active development. Review the [security policy](SECURITY.md) and [deployment guide](docs/deployment/production.md) before exposing an instance to the public internet.

## Workspace

- `apps/mobile`: Expo mobile shell
- `apps/mobile-api`: NestJS REST + SSE API
- `apps/task-router`: task classification rules
- `apps/openclaw-adapter`: Gateway transport and result archiving
- `apps/file-parser-worker`: isolated, resource-bounded file parsing service
- `apps/mock-gateway`: deterministic local Gateway replacement
- `packages/*`: shared config, auth, database, contracts, and protocol types

## Quick Start

For a complete local backend that does not need a real OpenClaw Gateway:

1. Install Docker, Node.js 22, and pnpm 10.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm demo:up`.
4. Run `pnpm demo:smoke`.
5. Set a device-reachable `EXPO_PUBLIC_API_BASE_URL`, then run
   `pnpm --filter @clawwork/mobile start`. See the local guide for emulator and
   physical-device addresses.

Use `pnpm demo:down` when finished. To connect a real Gateway instead, follow the detailed local workflow.

Detailed local workflow lives in [local-run.md](docs/development/local-run.md).
Production Compose, secrets, health checks, storage routing, and Prometheus are
documented in [production.md](docs/deployment/production.md).
The [architecture](docs/architecture.md) and [API overview](docs/api.md)
describe trust boundaries and public endpoints.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report vulnerabilities privately according to [SECURITY.md](SECURITY.md); do not include secrets or exploit details in public issues.

## License

Copyright © 2026 ClawWork contributors. ClawWork is distributed under the [GNU Affero General Public License v3.0 only](LICENSE). Network users must be offered the corresponding source for the version they use, as required by the license.
