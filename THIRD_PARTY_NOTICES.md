# Third-party software

ClawWork depends on third-party packages and container images under their own
licenses. The project license does not replace those licenses.

The production dependency inventory can be regenerated with:

```sh
pnpm licenses list --prod
```

The current dependency graph includes permissive licenses (including MIT,
Apache-2.0, BSD, ISC, Python-2.0, and CC0), Mozilla Public License 2.0
components, and CC-BY-4.0 data. Some packages offer a choice of licenses; this
project uses the permissive option where available, including MIT for JSZip and
BSD-3-Clause for node-forge.

Redis, PostgreSQL, MinIO, and other container images used for local or
production deployment retain their respective licenses. Distributors are
responsible for preserving notices and checking the exact dependency and image
versions they ship.
