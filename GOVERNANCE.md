# Governance

ClawWork uses a maintainer-led, contributor-driven model.

## Roles

- Contributors submit issues, documentation, code, tests, and reviews.
- Reviewers are trusted contributors who regularly review a defined area.
- Maintainers merge changes, publish releases, manage security reports, and
  enforce project policies.

The current maintainer roster is in [MAINTAINERS.md](MAINTAINERS.md). New
reviewers or maintainers are added based on sustained, constructive
contributions and sound security judgment. Inactive maintainers may step down or
be moved to emeritus status.

## Decisions

Routine changes are decided through pull request review. Maintainers seek rough
consensus for public API, persistence, licensing, security boundary, and
governance changes. When consensus is not possible, the lead maintainer records
the decision and rationale in the relevant issue or pull request.

No contributor may unilaterally weaken authentication, authorization,
encryption, auditability, licensing, or responsible disclosure requirements.

## Releases and project assets

Maintainers control release tags and the official repository. Releases should
follow [CHANGELOG.md](CHANGELOG.md), pass CI, and document migrations and known
security implications. The AGPL license permits forks; a fork must not imply
official project endorsement.
