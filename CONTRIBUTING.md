# Contributing to ClawWork

Thank you for helping improve ClawWork. Contributions are accepted under the
project's [AGPL-3.0-only license](LICENSE).

## Before opening a change

- Search existing issues and pull requests.
- Use an issue for behavior, API, schema, dependency, or deployment changes so
  maintainers can confirm the direction first.
- Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
- Keep pull requests focused; unrelated cleanup should be separate.

## Local setup

ClawWork requires Node.js 22, pnpm 10, and Docker.

```sh
pnpm install --frozen-lockfile
pnpm demo:up
pnpm demo:smoke
```

Run `pnpm demo:down` after testing. See
[docs/development/local-run.md](docs/development/local-run.md) for the real
Gateway workflow.

## Quality checks

Before opening a pull request, run the narrow checks for the packages you
changed. For a cross-workspace change, run:

```sh
pnpm check:open-source
pnpm check:workspace
pnpm lint
pnpm test
pnpm audit:prod
```

Never weaken a check to make it pass. Explain any check that cannot run in the
pull request.

## Commit and pull request conventions

Use imperative Conventional Commit subjects such as `feat(api): add task
cancellation` or `fix(parser): enforce extraction timeout`. Do not include
generated build output, local `.env` files, credentials, or unrelated
formatting.

Pull requests should describe the user-visible outcome, security and migration
impact, tests performed, and any remaining limitation. Database schema changes
must include a Prisma migration. Behavior changes should include tests.

## Developer Certificate of Origin

By contributing, you certify that you have the right to submit the work under
the project license. Add `Signed-off-by: Your Name <you@example.com>` to each
commit with `git commit -s`.
