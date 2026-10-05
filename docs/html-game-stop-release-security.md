# HTML-game hotfix release security, 2026-10-05

Status: passed-with-accepted-risks under explicit owner acceptance on 2026-10-05; build-only authorization. Production promotion remains on hold.

Fresh full frontend audit found 30 affected packages including a Critical Orval finding. Compatible lockfile updates and API client regeneration reduce this to five High package entries for one advisory, GHSA-vfj7-8cjw-p6xm / CVE-2026-93687. The primary advisory lists braces <=3.0.3 and no patched version: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm. npm suggests a major Tailwind 4 migration, which changes the styling/build pipeline and needs separate regression coverage. These findings are not covered by the existing JVM exceptions.

Exact affected package versions in frontend/package-lock.json:
- braces 3.0.3
- chokidar 3.6.0
- fast-glob 3.3.3
- micromatch 4.0.8
- tailwindcss 3.4.19

The remaining dependency chain is Tailwind → chokidar/fast-glob/micromatch → braces. Package-manager omit-dev classification still includes the chain because Tailwind is listed as a frontend dependency; it is not a clean full scan. web-app/Dockerfile copies only nginx configuration and static dist files into nginx, so this Node tool chain is absent from the final web runtime container. The risk is stack exhaustion from deeply nested brace patterns during source/build processing; controlled checked-in source reduces exposure but does not fix the vulnerability. No scanner suppression or false-positive classification is added.

Collaboration-service full audit reports zero findings. Existing JVM services/images are unaffected; no JVM risk exception is broadened. Current official Keycloak releases were reviewed; upgrading the unchanged identity service requires its own compatibility/backup and device acceptance gates.

Owner approval: “разрешаю исключение на 2 месяца, по окончании проверить новую версию - запиши в agents.md, собери прод, но не деплой - сейчас идет урок”. Accepted at 2026-10-05 10:46:15 UTC; expires 2026-12-05 10:46:15 UTC, two calendar months. Exact scope is this HTML-game hotfix candidate and its develop merge-back with the package versions above. Fresh scans/raw reports remain mandatory; unlisted findings, version/scope changes, scan errors and expiry block publication. No JVM exception is extended. Machine-readable record: docs/security/node-dependency-security-accepted-risks.json. Both workspace and platform AGENTS.md record the rule. A one-time check of upstream versions is scheduled for 2026-12-05 13:47 MSK in the current task; acceptance cannot renew automatically.
