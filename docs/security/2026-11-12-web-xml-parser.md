# Web XML parser dependency update

The full frontend audit found GHSA-474x-hrwr-fgx4 in `fast-xml-parser` versions used directly and through the PPTX viewer. The compatible update to 5.12.0 resolves all three affected lockfile locations without changing the viewer API. Re-run the full audit, document/PPTX validation, exact-image scan and installed DEV acceptance for the reviewed candidate.

The updated full audit retains seven moderate development-only package nodes on the `typescript-eslint` / `minimatch` chain. These are unresolved findings, not a clean full scan. All affected lockfile nodes are marked development-only; the static web runtime must also be verified to exclude the toolchain under the project's outside-server-runtime policy. No risk exception is extended.
