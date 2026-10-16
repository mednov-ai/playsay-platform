# Shared HTML-game library develop delivery — 2026-10-16

Owner instruction: «мерджи в develop проследи за развертыванием». Scope: both develop branches and DEV; production promotion and real production migration remain pending.

**DEV delivery outcome:** both develop integrations and native DEV functional acceptance are complete: cutoff275 mapped / 255 active games / 241 verified material references; primary14/14 and RF19/19; final normal snapshot queue zero. Production promotion/backfill and OpenSpec archive remain pending. **Incident:** agent diagnostics caused two earlier DEV collaboration process exits and eleven in-memory pending payloads were not recovered; see the incident section below.

Implementation source commits: platform `7cd6afa2`, infra `45783f4`. Three-way port onto platform `1b7384be79d22346d080c7e48dfd0f90b2b2bef0` and infra `62a80a1810e7bc6a85d36ca8ae35d4a8f8760d1a` preserves current session recovery, scheduling, security, Keycloak and environment desired state. Infra PR34 merged as `f1bf7e7c2ef51d99b4eb7152f7ebd3ddde5fa48f`. Original dirty checkouts remain untouched; invalid duplicate remote refs required clean delivery clones.

## Local integration checks

- Selected server suite: 73 cases, 72 passed, one optional external fixture skipped, no failures/errors; Detekt main zero findings.
- Full frontend: 164 files, 932 tests passed. Lint passed. OpenAPI exported from integrated source and client regenerated through project commands.
- Collaboration: 78 tests passed and build passed. SDK: 12 tests passed and build passed.
- Helm lint, guarded migration renders, upload-route and generated API/reference contracts passed.
- Fresh full npm audits: collaboration zero findings; frontend five high advisory nodes in braces/chokidar/fast-glob/micromatch/tailwindcss. They remain raw findings. Exact versions, lock/audit/Dockerfile hashes and outside-server-runtime classification are retained in protected local evidence `delivery-node-gate.json`. The static nginx Dockerfile copies only dist and configuration, with no Node interpreter or node_modules. Owner policy 2026-10-14 applies; no exception is extended or broadened.

Evidence directory: `/Users/evgeniymednov/Documents/Projects/Play&Say/local-results/shared-html-game-library-20261016`. Native CI security, exact-source rollout, PostgreSQL migration, actual library workflows and legacy inventory are recorded after completion. Local checks do not claim authenticated native DEV or production acceptance.

## Delivery routing correction

Initial dispatcher256 stopped before publication on unmapped `contracts/material-game-reference.schema.json`. Added an explicit API/web routing rule and its test. The AJV/YAML validation runs in the web job after frontend dependencies are installed, outside the dependency-free dispatcher contract test glob. Full CI contracts: 60 passed, 3 optional environment fixtures skipped. Native delivery must analyze the original feature range, including collaboration-service. Local rebuilt browser matrix passes all eight combinations.

DEV inventory found 275 legacy HTML assets and 65 historical IN_PROGRESS rows, with zero unexpired access windows. Migration drain now reuses the server access-deadline function including grace/extension and treats unknown end times as active. The regression verifies active/extended blocking and expired-history retention; it does not authorize forcibly completing lessons.

## Native layout regression and correction

Web394 published successfully but its real Sprint5 UI acceptance found the connected material hidden below the visible grid row. The added library controls/error/stage were separate grid items. The correction keeps the Games action in the video header and uses one bounded primary column for material/game/error, retaining the mounted material workspace. Real DEV Keycloak/API/classroom browser checks with candidate static assets confirm teacher and student material surfaces remain visible; screenshots are retained as material-layout-teacher/student.png. This candidate-overlay result is preparatory, not deployed-source acceptance. Focused component tests cover the shared primary column/error placement; build and lint pass. Full deployed UI smoke remains mandatory.

## Full server architecture gate

Native API207 retained 486 cases: three architecture failures, two skips and all remaining functional tests passed. It did not run schema migration or publish an API image. Resolve this by moving prepared SQL and row mapping into repository APIs with private JDBC dependencies (catalog, launch, processing, bounded migration), splitting catalog/material/processing controllers and extracting the legacy upload orchestration from LessonMaterialStore. Transaction ownership, parameter order, row locks, fencing/CAS and failure cleanup are retained. The synthetic database-failure test now checks Spring repository exception translation and its original cause, plus rollback/object cleanup. No guard/threshold/allowlist is weakened.

The corrected local full API suite passes 486 cases (484 passed, one optional external-file fixture skipped and the dedicated OpenAPI exporter skipped in the normal test task; its separate export task passes), with Detekt zero findings. Generated API content remains equivalent. Full frontend again passes 932 cases; the eight browser combinations pass. Migration Job logs expose bounded aggregate outcome/error-code counts, without source IDs or content. The minimized game consumes only its toolbar height inside the shared primary column. Native CI is repeated on the final integrated source before rollout.


## Final native DEV source and security

Runtime source: `de3060983fa0d7d3f79d915b079f6cb6936f39fd` (platform PR65; preceding feature/routing/layout/memory PR61–64 are merged). Dispatcher263 analyzes the full original feature range from `1b7384be79d22346d080c7e48dfd0f90b2b2bef0`, including all five affected modules. A late incremental webhook run262 was stopped before publication because it omitted the original migration range; API209 explicitly detected and successfully executed the required Liquibase Job. API209, web398, vocabulary75 and collaboration59 pass native gates; final keyboard/dispatcher result is recorded below after completion.

Fresh native JVM reports are retained in `native-jvm-security-final.json`: API209 29 archived files/two gates; vocabulary75 19 archived files/two gates; zero blocking findings. The exact active Kotlin acceptance remains bounded to its existing matrix/expiry. No expired Netty exception is renewed. The full web398 audit retains six high dependency nodes (braces3.0.3, chokidar3.6.0, fast-glob3.3.3, micromatch4.0.8, tailwindcss3.4.19 and tailwindcss-animate1.0.7); lock metadata changes contain zero package-version changes. `native-node-gate-final.json` records hashes and `passed-with-outside-server-runtime`. Inspection of the actual deployed web container confirms nginx is present and Node/npm/node_modules are absent. Findings remain unresolved raw findings, with owner policy applied only to their verified runtime boundary.

DEV immutable images: API209 `sha256:a4432f7d8c1d2733fd24d6a142f5119dfd2918b570ad13ef8398f38a86092d3e`; web398 `sha256:59e0def7188abd50d7b99b7ff950124a7da68a551b354d6b5cf0600b2715f111`; collaboration59 `sha256:06fe50eb8733e7f007d82ff96c39802889067edd0b16accd4fd34a47a9d09d6b`.

## DEV migration preparation

Only DEV edge routes were applied using the scoped AX41 procedure and RF dev-ingress tag; shared production blocks were preserved. Both DEV origins respond successfully. The exact library/revision/material/live HTML routes use a 21 MiB multipart envelope, with application validation retaining the 20 MiB file limit.

Read-only versioned Job `api-gateway-game-library-dev-inventory-1016-a` completed at 15:39:59 UTC with 275 READY, zero BLOCKED. This is the complete bounded UUID inventory, not a page sample. Its aggregate log/status is retained as `dev-inventory.log`.

Before mutating cutover, GitOps disabled writers and activated maintenance on the exact API209 image. The full database backup `/var/backups/playsay/shared-html-games-20261016T154127Z` passed an isolated PostgreSQL restore (275 HTML assets) and SHA256 `3fbd5754d1b27f04b5e4238d4714ee4a420ea8fa2c0018066a8c3512136d3e28`. Private object backup `/var/backups/playsay/game-library-objects-20261016T154127Z` contains 1,295 objects / 530,258,530 bytes; actual upload/download restore to an own temporary bucket matches every hash, manifest SHA256 `c32a02a6a18440144b1eb03411ea7d43060f685fb79ac67fd53b5de1d52e51ad`. Original objects/backups remain; only own temporary restore database/bucket/scratch was removed.

Capacity inventory found all 275 HTML sources (239,064,495 bytes) and 70 cover rows (2,025,383 bytes) in the backup, with no missing source object. The private MinIO PVC is 10 GiB and current bucket data is about 530 MB; host available capacity after refreshed backups is 22,933,946,368 bytes. The bounded migration container has 768 MiB memory/500m CPU and a 1,800-second deadline.

Fresh drain snapshots at 15:42:04 and 15:42:39 UTC confirm: zero live lesson-access windows (including grace/extensions/unknown-end handling), zero game processing/adaptation/enrichment pending, zero collaboration connections/rooms/snapshot queue, zero LiveKit rooms/participants. Historical expired IN_PROGRESS records are preserved. Evidence: `dev-drain-1.log`, `dev-drain-2.log`, protected backup/capacity logs. Apply Job and final acceptance are recorded after completion; no production migration is claimed.


## DEV resume correction

The first mutating Job `dev-cutover-1016-a` did not complete: 36 valid JPEG covers have generic `application/octet-stream` object metadata, and the inherited server JVM percentage profile hit the 768 MiB Job cgroup limit (OOMKilled137). Successful source transactions/checkpoints remain; no destructive rollback is attempted and maintenance/writers remain paused. Native metadata inventory confirms 70 actual JPEG covers: 34 declared image/jpeg and 36 generic. No image content or private keys are exposed in the aggregate evidence.

The forward correction recognizes only PNG/JPEG raster signatures for generic legacy MIME, preserves exact original bytes, rejects unknown generic content, and makes dry-run validate covers too. The integration regression covers invalid-content blocking without alias leakage, correction/restart, two repeated passes, canonical image/jpeg and exact original/copy bytes. A separate migration JVM profile replaces server sizing; the bounded Job gets 1 GiB cgroup headroom. Native delivery and resume must pass before this is a completed cutover.


## Successful native resume and reconciliation

Dispatcher264 and API210 pass on `bf6736ec79873cb39e40aa64af80f614d2cce054` (PR66). The fresh API210 security reports again retain 29 files/two `passed-with-accepted-risks` gates with zero blockers in `native-jvm-security-resume.json`. Runtime API210 digest is `sha256:4527635c11e34b3f78bb43ec5285088cf93f48b9c125c4722f8d7d6a7932a489`; unchanged web398/collaboration59/vocabulary75/keyboard110 keep their successful de306098 source mapping. No server/frontend dependencies were changed by the resume fix.

Before resume, `/var/backups/playsay/shared-html-games-20261016T162909Z` passed actual isolated restore (275 legacy sources), dump SHA256 `b0e65c8227fe6acf9912f0a9e84650b1d80060eaad03e0190dd3db0c479edc58`. Private object backup `/var/backups/playsay/game-library-objects-20261016T162909Z` includes partial progress: 1,502 objects / 668,021,781 bytes, every restored hash matched, manifest SHA256 `ee0d2ec944edc35275bd90f72796683f9f66d9e0e17017eb7eec3796bd6d4fe2`. Available host capacity remained 22,419,398,656 bytes. Fresh 16:30:32/16:32:50 drain snapshots again confirm zero active lesson windows, processing, collaboration and media participants.

Corrected inventory `dev-inventory-1016-b` completed with 275 READY/zero blocked at 16:32:53 UTC. The migration container sampled 525 MiB under its 1 GiB bound; the sample is not a peak-memory stress certification. Resume Job `dev-cutover-1016-b` completed at 16:37:30 UTC with all sources mapped, no blocked batches and full `inventoryVersion=1, mapped=275, candidates=0, references=241, unresolved=0`. It verifies every current source/independent HTML/cover hash and effective material reference. No original object, checkpoint or schema was deleted; no SQL/source mapping was edited manually. Aggregate Job logs and Kubernetes Complete status are retained in `dev-inventory-resume.log` / `dev-cutover-resume.log`.

Authenticated read-only recovery checks before the resume also passed: another teacher reads catalog page two and canonical content, opens UI preview, a learner receives 403 for the catalog and writes return application 503 while paused (`native-paused-readers.log`). Reader/writer restoration and final two-origin gameplay acceptance follow this completed reconciliation; production remains unchanged.


## Native focused-preview regression

The first post-cutover primary-origin browser run passed migrated search/content, UI upload/authored title and shared/learner catalog authorization, then found Escape did not close the dialog after interacting inside its sandboxed iframe. Its synthetic game/profile cleanup completed; this failed run is not final acceptance. Preview now opts into a per-frame/channel Escape relay. Messages from another window/channel cannot close it, callback refresh preserves the mounted iframe, and ordinary lesson frames do not install this preview shortcut. Local regression: 22 frame tests, lint/build and all eight real Chromium/WebKit desktop/mobile light/dark combinations pass after clicking the preview game before Escape. Native frontend publication and full two-origin acceptance must complete below.

The complete local frontend suite passes 164 files / 935 cases. Local Node26 requires `--no-experimental-webstorage` to avoid its host WebStorage colliding with JSDOM; the initial host-environment failure is retained, and native CI uses its pinned Node22 runtime.


## Full-classroom focus and clock reconciliation

Web399 passes native CI and publishes the focused-preview Escape correction. Further real-DEV two-client acceptance found toolbar pointer clicks targeting a newly inserted clock warning instead of the intended button. The button remained mounted and its click listener received zero clicks; DOM capture identified the trusted target as the clock warning. Moving from sandboxed iframe focus to its parent fires window blur/focus while `document.hasFocus()` remains true in both real Chromium and WebKit. The active-lesson focus listener was treating that internal transition as an external resume, invalidating the clock anchor and shifting the classroom during the click.

The forward fix distinguishes internal focus from actual external window loss/return, preserves visibility/pageshow/online reconciliation, removes duplicate focus refresh after another resume event, and leaves the fifteen-second poll/offline invalidation/expiry policy unchanged. Full local frontend: 165 files / 939 tests; lint/build and eight browser combinations pass. Browser regressions now count clock-resume events across preview and live iframe interaction. Candidate static assets with real DEV services must complete full classroom acceptance, then a separately published frontend must repeat native two-origin acceptance. Synthetic fixture input also waits for microphone readiness and uses native pointer input for prejoin recording.

Candidate static assets with real DEV authentication/API/collaboration/media pass the complete scenario after the focus correction: the actual minimize click now targets the button once, the mounted stage enters flex-none, state survives minimize/reload, learner stop and fresh relaunch work, and attached material plus mobile learner actions remain intact. This is explicitly candidate acceptance, not native publication. Own fixtures were cleaned.


## Immediate learner reload regression

Published web400 exposed a reconnect failure after two quick actions: the learner restarted at zero while the authority retained two. The fallback path carried action/effect data but omitted resume/recovery control, and session registration could precede the sandbox hello/context. No SDK checkpoint interval, uploaded game, server protocol or DEV transport mode is changed. The correction routes control through the existing bounded ephemeral fallback, replays bounded authority history, attaches only after context, and hydrates a newer late matching checkpoint before requesting its tail. Stale checkpoints cannot rewind sessions.

Local validation: all 165 files / 943 tests pass, including fallback/shadow replay and context-before-replay assertions. The real Chromium/WebKit desktop/mobile light/dark matrix passes all eight combinations, now including two quick actions followed immediately by learner reload and a third synchronized action. Native publication and two-origin acceptance remain required.

Candidate static assets with real DEV services pass all 15 checks, including restored count two and a third action synchronized back to the authority. Synthetic games/materials/lessons were cleaned. Protected report: `candidate-reconnect-fixed-results.json`; publication acceptance remains separate.


## Published frontend and security

Platform PR69 merges as `977a504e6c886cee4891ce5661cea4f5798b8ae6`. Native dispatcher267 / web401 finish SUCCESS. Infra GitOps commit `25c456cd8b16bd363872342f3a93512b5d6032e4` publishes web401 digest `sha256:05c3b6c584b38eaf04a35f5360b7b2029b3473385e865814f68c3bf3d7b0bccf`. Independent Kubernetes inspection verifies exact pod imageID, observed generation, ready 1/1, zero restarts and all affected Argo applications Synced/Healthy.

Fresh native full audit `native-node-audit-web401.json` includes production and development dependencies: six high nodes, zero critical/moderate/low, no package-version changes from the previously reviewed native lock. Lock SHA256 `0b8eb2f535bc008f80c2ae3cdecef64e9d51ceb66113573424e996c5031eef66`; raw report SHA256 `32f6ce99c63b5bd0a7c948827c344f2c5f04de4640992b02c6a198891669a897`. Exact findings remain braces3.0.3, chokidar3.6.0, fast-glob3.3.3, micromatch4.0.8, tailwindcss3.4.19, tailwindcss-animate1.0.7. Actual final nginx container has no node/npm/npx/yarn/pnpm executable and no node_modules below /usr, /opt or /var. Dockerfile copies only compiled dist/configuration. Gate `passed-with-outside-server-runtime` follows the owner's 2026-10-14 policy, without broadening/renewing any risk exception or claiming remediation. Retained exact-image inventory and gate: `native-web401-runtime-inventory.json`, `native-node-gate-web401.json`. An initial audit attempt before the agent workspace was ready failed; it is retained separately and superseded by the successful full report.

Primary DEV origin native acceptance passes all 14 checks with `candidateStaticAssets=false`, including restored count two, third synchronized action, independent fresh launch, learner stop, materials and mobile actions. Own game/material/lesson cleanup is empty. Protected result: `native-school-web401-results.json`. Supplemental catalog layout waits for loaded cards: desktop/mobile each render 24 cards with no horizontal overflow; screenshots inspected.

The first RF run passes ten checks including reconnect, then times out after 30 seconds waiting for the fresh relaunch. Both screenshots show the loading surface, with no game error; own cleanup completes. Its log/screens/result are retained as `native-rf-web401.log` and `rf-relaunch-failure-*`; no cause is asserted. An unchanged-source RF repeat passes all 14 checks and cleans its fixtures (`native-rf-web401-retry-results.json`). Additional repeated launch acceptance follows separately rather than discarding this initial failure. Early catalog screenshots captured navigation before cards loaded; the supplemental loaded-card checks replace those images as layout evidence.


## Retired snapshot correction and diagnostic incident

The final readiness inspection after successful RF19 (including five fresh launch cycles) found 11 retained snapshot queue entries despite zero open lesson windows, connections, rooms and media participants. Source investigation identifies the retirement mismatch: internal game snapshot writes return HTTP403 `GAME_LAUNCH_NOT_ACTIVE` / `GAME_LESSON_ACCESS_DENIED`; the generic queue classified them as terminal unsaved state. PR70 (`cd7930ce217d5625447a8f55066091fbf4b9cc24`) treats only these exact responses on signed LESSON_GAME claims as invalidation, releasing transient pending state and rejecting retired restore. Other 403/401/409, malformed responses and material documents preserve fail-closed retention. Local collaboration: 17 files / 86 tests and TypeScript build pass.

**Agent-caused DEV diagnostic incident:** while investigating the retained queue before rollout, a V8 Inspector metadata probe used unsupported dynamic import inside Runtime.evaluate. The scheduled diagnostic cleanup threw `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`; the DEV collaboration59 process exited twice (container restartCount2, last exit1 at 18:23:28 UTC). This was an agent error and violates the intended lossless queue-drain boundary. It must not be described as a graceful drain or successful metadata inspection. Eleven in-memory pending payloads were not recovered; their individual ownership was not established. The last captured pre-probe readiness snapshots (18:16:01 / 18:17:04 UTC) show zero live lesson windows, collaboration connections/rooms and media participants; continuous activity at the exact exit instants was not captured. Previously durable data was not manually edited. Subsequent aggregate database inspection verifies cutoff MAPPED275, ACTIVE255, zero active game launches and zero retained LESSON_GAME documents. Alias count288 includes thirteen new canonical material-upload fixtures beyond the migrated cutoff.

Protected raw previous-container logs remain at `/var/tmp/playsay-shared-games-inspector-incident-previous.log` on DEV; local `snapshot-diagnostic-incident.json` records termination, counts and limits. The debugger port is confirmed closed. Initial empty inspector probe output is invalid evidence and is not used. The user was informed of both restarts and unrecovered pending payloads. No production operation occurred.

Collaboration CI publication was explicitly held while investigating (module temporarily disabled); it was re-enabled only after two post-incident zero queue/window/connection/room snapshots at 18:26:01 UTC and later. These establish current readiness, not recovery of the lost queue. The guarded retirement fix and post-publication functional/queue acceptance follow separately. The first four synthetic identities were removed and absence verified; fresh task-only identities were created for post-correction acceptance and must also be cleaned.


## Retirement correction publication

Native collaboration60 uses platform `cd7930ce217d5625447a8f55066091fbf4b9cc24`; infra `56963d9` publishes digest `sha256:eb1f2cb8a8c95b39a97bac8b606df9421250cd774a0706b8ef3ef05b227d2750`. Exact pod imageID/readiness and Argo Synced/Healthy are independently verified. The new pod starts with zero restarts; this does not erase the two earlier agent-caused collaboration59 exits documented above. No active teaching/test activity occurred before this rollout, and current pre-rollout queue was zero.

Fresh native full npm audit for collaboration60 reports zero findings, including development dependencies. Lock SHA256 `a6f732a5ef8867f666c2af85315aff7f07a4b4ddce7d9dbd7fdf34d6d287955d`; retained raw wrapper SHA256 `cde86008d2153b127915ddb8c11f4ea18871526bb6d2651c2d35bdeae8790950` (`native-collab60-audit.json`). Previously published web401 and API210 images remain unchanged. Final post-correction browser/queue acceptance follows below.

Post-correction primary-origin native acceptance passes all 14 scenarios with no candidate asset routing; supported cleanup archives own games/materials and removes own lessons. At 18:34:17 UTC, active windows/processing/connections/rooms/media participants and **snapshot queue are all zero** after those real stop/relaunch/reload operations. This is normal post-correction queue acceptance, distinct from the earlier incident reset. The result is retained as `native-school-retirement-final-results.json`; extended RF acceptance follows.


## Final DEV acceptance

Post-correction native acceptance uses published web401 / collaboration60 with real DEV Keycloak/API/collaboration/media and no candidate asset routing: **primary14/14; RF19/19**, including five additional start/action/stop cycles. Both origins verify shared teacher access, learner catalog denial, migrated search/content, UI upload, preview Escape, new/existing material reuse, canonical upload retry, no-material lesson, minimize/state, learner reload with continued synchronization, explicit stop/fresh state, attached-material preservation and mobile learner actions. Separate loaded-card layout checks render 24 cards on desktop/mobile at each origin with no horizontal overflow; representative desktop/mobile screenshots were inspected. Both origin upload-boundary tests pass exact20MiB, idempotent same game/revision retry and 20MiB+1 application413 on unchanged API210/edges.

All own browser game/material/lesson cleanup sets are empty; games/materials are archived using supported retention semantics, lessons removed, teacher assignment/profile settings reset. Both four-account batches are removed from Keycloak with absence verified; local task credentials are deleted. Original checkout status lists exactly match the initial lists (platform152 changes / infra33), preserving unrelated work.

After real post-correction stop/relaunch/reload operations, primary snapshot queue is zero at 18:34:17 UTC. Two final post-RF snapshots also show zero live lesson windows, processing, collaboration connections/rooms/queue and media participants/rooms. Migration remains disabled; writers=true / maintenance=false. Exact imageIDs, observed generations, ready counts and affected Argo Synced/Healthy are independently verified. Native dispatcher268 / collaboration60 and prior dispatcher267 / web401 are SUCCESS. New collaboration60 remains at zero restarts; the earlier two collaboration59 diagnostic exits and eleven unrecovered pending payloads remain an explicit incident, not erased by this acceptance.

Protected final reports: `native-school-retirement-final-results.json`, `native-rf-retirement-final-results.json`, `dev-post-retirement-final-1.log`, `dev-post-retirement-final-2.log`, `dev-accepted-runtime.json`, `native-ci-retirement-final.jsonl`. Media is synthetic: these checks do not establish physical speaker/camera or human validation of every historical game's mechanics. The earlier one-off RF loading timeout is retained; it does not recur in unchanged-source repeats or post-correction repeated-launch acceptance.

| Service | Build | Published source | Immutable image |
| --- | --- | --- | --- |
| api-gateway | 210 | `bf6736ec79873cb39e40aa64af80f614d2cce054` | `ghcr.io/mednov-ai/playsay-api-gateway@sha256:4527635c11e34b3f78bb43ec5285088cf93f48b9c125c4722f8d7d6a7932a489` |
| web-app | 401 | `977a504e6c886cee4891ce5661cea4f5798b8ae6` | `ghcr.io/mednov-ai/playsay-web-app@sha256:05c3b6c584b38eaf04a35f5360b7b2029b3473385e865814f68c3bf3d7b0bccf` |
| collaboration-service | 60 | `cd7930ce217d5625447a8f55066091fbf4b9cc24` | `ghcr.io/mednov-ai/playsay-collaboration-service@sha256:eb1f2cb8a8c95b39a97bac8b606df9421250cd774a0706b8ef3ef05b227d2750` |
| vocabulary-service | 75 | `de3060983fa0d7d3f79d915b079f6cb6936f39fd` | `ghcr.io/mednov-ai/playsay-vocabulary-service@sha256:f76128c5cf0a63b8635a7bebb08df6ae16cc3d1e598fc1c0f7edd492e71dc4fd` |
| keyboard-app | 110 | `de3060983fa0d7d3f79d915b079f6cb6936f39fd` | `ghcr.io/mednov-ai/playsay-keyboard-app@sha256:96c7ec18a88e89a3a52933fb09dd853cc14ed1d45124af98877ed155f2ee98d5` |
