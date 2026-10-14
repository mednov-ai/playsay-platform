# Session recovery security gate

On 2026-10-09 the owner explicitly accepted CVE-2026-93687 / GHSA-vfj7-8cjw-p6xm for this hotfix, its develop integration and numeric production release/promotion through the existing expiry, 2026-12-05 10:46:15 UTC. Exact packages and owner evidence are in `security/node-dependency-security-accepted-risks.json`. The gate is `passed-with-accepted-risks` only after a fresh full audit has no other blocking findings or errors.

Develop received the compatible MCP SDK 1.30.0 → 1.32.1 lockfile update. This production-based candidate has no installed MCP SDK and excludes that commit; its fresh full audit verifies the finding is absent. Official braces registry still publishes 3.0.3; upstream PR #87 is open, and the advisory lists no patched version. Source patches are not treated as a published compatible release.

Retain full raw audit and resolved-version evidence with the release artifacts. Neither omit-dev scans nor this frontend acceptance extend the expired JVM exceptions. Release scope must exclude unrelated develop changes and retain exact-source DEV, schema-convergence, backup and GitOps acceptance.

Sources: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm ; https://github.com/micromatch/braces/pull/87 ; https://github.com/advisories/GHSA-6qxp-vccf-f47h
