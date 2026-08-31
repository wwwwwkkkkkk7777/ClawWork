# Security Policy

## Supported versions

ClawWork has not reached a stable release. Security fixes are applied to the
latest commit on the default branch; older commits and forks are not maintained
by this project.

## Reporting a vulnerability

Do not open a public issue or pull request containing exploit details,
credentials, personal data, or an undisclosed vulnerability.

Use GitHub's
[private security advisory form](https://github.com/wwwwwkkkkkk7777/ClawWork/security/advisories/new).
Include the affected revision, prerequisites, impact, a minimal reproduction,
and suggested remediation if known. Remove real user data and secrets.

Maintainers aim to acknowledge a report within seven calendar days and provide
a triage decision within fourteen. These are targets, not a service-level
guarantee. A coordinated disclosure date will be agreed after severity and
remediation are understood.

## Security expectations for deployments

- Replace every example secret and terminate TLS at a trusted reverse proxy.
- Keep PostgreSQL, Redis, MinIO, the parser, adapter, and metrics endpoints off
  the public network.
- Use least-privilege S3 credentials and back up both PostgreSQL and object
  storage.
- Run only files and container images from revisions you have reviewed.
- Apply dependency and base-image updates promptly.

See [docs/deployment/production.md](docs/deployment/production.md) for the
deployment checklist. This policy does not make a development checkout safe for
processing highly sensitive data.
