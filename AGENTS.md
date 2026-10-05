# Honey School platform guide

Follow the Honey School workspace agent guide and the current infrastructure runbook. Preserve existing work; scope application changes and use GitOps for separately authorized delivery. Never deploy a numeric candidate merely because its build succeeds. The owner authorized production build only on 2026-10-05 while a lesson is active; production promotion and subsequent merge-back/cleanup remain pending.

## Temporary frontend build-tool risk acceptance

On 2026-10-05 the project owner explicitly accepted **CVE-2026-93687 / GHSA-vfj7-8cjw-p6xm** for two calendar months, until **2026-12-05 10:46:15 UTC (13:46:15 MSK)**. Scope is the HTML-game explicit-stop hotfix release candidate and its develop merge-back, with the exact frontend lockfile chain: `braces@3.0.3`, `chokidar@3.6.0`, `fast-glob@3.3.3`, `micromatch@4.0.8`, `tailwindcss@3.4.19`. The failure is stack exhaustion from deeply nested brace patterns in controlled source/build processing. These Node build tools are not copied into the static nginx web runtime image. This is an unresolved accepted risk, not a false positive or a vulnerability fix.

Exact scope and owner evidence are recorded in `docs/security/node-dependency-security-accepted-risks.json` and `docs/html-game-stop-release-security.md`. Retain fresh full audit reports and label the gate `passed-with-accepted-risks`; only these exact advisory/package/version/build combinations are allowed. New findings, changed/unlisted versions or scope, audit errors, and expiry still block publication. Do not treat `--omit=dev` as full clearance. This exception does not extend the separate JVM exceptions expiring 2026-10-08.

At expiry, check official braces/Tailwind releases and advisories, verify a compatible upgrade or separately tested migration, remove this exception when fixed, and report the result to the owner. A one-time follow-up is scheduled for 2026-12-05 13:47 MSK in this task. Never automatically renew or broaden the exception. Risk acceptance itself does not authorize deployment: the owner's current instruction is production build only, with no deployment while a lesson is active.
