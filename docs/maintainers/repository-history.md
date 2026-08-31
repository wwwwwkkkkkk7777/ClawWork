# Repository history and release hygiene

This repository preserves published history by default. Maintainers must not
rewrite the default branch merely to make commits look cleaner.

Before the first public release:

1. Freeze merges and create a recoverable mirror backup.
2. Run a secret scanner across all refs, not only the working tree.
3. Review large blobs, generated files, author identities, license provenance,
   and paths excluded from release archives.
4. Rotate any exposed credential before changing history.
5. If removal is legally or operationally required, document the exact objects
   and impact, obtain maintainer approval, use `git-filter-repo` on a mirror,
   re-scan all refs, and coordinate the force update with every collaborator.

Formatting-only commits may be listed in `.git-blame-ignore-revs` after they
exist; never list substantive changes. `.mailmap` normalizes author display
without altering commit IDs. Release archives exclude internal implementation
notes through `.gitattributes`, while Git retains their audit trail.

Use signed, DCO-certified Conventional Commits. Release tags should be annotated
and signed where practical. Update [CHANGELOG.md](../../CHANGELOG.md) in the
release pull request; do not reconstruct release notes after publishing.
