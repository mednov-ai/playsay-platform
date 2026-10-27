# Drawing palette release security, 2026-10-27

The fix-only candidate starts from production platform `87a9389c41afba98757ca3375399c7dd1963aced` (`release/01.007.19`). No package manifest, lockfile, backend, schema or wire format changes are introduced by this hotfix.

Fresh full `npm audit --json` retains nine package records (three high, six moderate): Vite 6.4.3 / browser-extension Vite 7.3.6, undici 7.29.1, zod 4.6.5, orval 8.40.0, @scalar/json-magic 0.15.4, @scalar/openapi-parser 0.29.10, @vitest/mocker 4.1.11, vitest 4.1.11 and fast-uri 3.1.8. Every exact resolved path is dev-only in the lockfile; a fresh Rollup included-module inventory verifies none of these packages occurs in emitted web chunks. The web Dockerfile copies only nginx configuration and `web-app/dist` into nginx:1.27-alpine. Runtime image inspection is an additional delivery gate.

Classification follows the owner's 2026-10-14 policy: **outside-server-runtime**. Raw findings are retained, not suppressed; this is not a false positive, remediation or exception renewal. Scanner errors, unknown membership or a changed candidate invalidate the gate. No expired JVM exception or risk acceptance for another hotfix is reused. Only web-app is rebuilt; unchanged backend images remain at their verified production digests and schema convergence remains mandatory.

Reports are retained outside Git under workspace `hotfix-results/drawing-palette-20261027/full-audit.json`, `delivery/node-security-gate.json` and `delivery/runtime-module-inventory.json`. The machine-readable gate records exact versions and SHA-256 hashes of the audit, lockfile and Dockerfile. Native CI source, installed lockfile and image boundary must match before promotion.

Official upstream review confirms patched Vite and undici releases are available. Dependency upgrades are separate maintenance work; this narrow palette candidate preserves the production lockfile and uses the already authorized runtime boundary policy.

- [Vite advisory and fixed versions](https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22)
- [Undici advisory and fixed versions](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c)
