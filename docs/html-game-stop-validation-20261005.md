# HTML-game stop hotfix: local validation, 2026-10-05

## Scope and baseline

Change: `hotfix-html-game-explicit-stop`. Platform baseline: latest locally available canonical numeric release `origin/release/01.007.12`, SHA `9124b4bff3c9d35ed6aa4924d70300ec4fa5cab1`. No remote ref refresh or production read was authorized. The local `.12` production pointer is supporting local evidence, not a live deployment check.

The user requested an isolated worktree with all local additional files and removal after implementation. 36,903 untracked/ignored files (about 4.3GB) were copied from the original platform checkout. 45 additional-file collisions with release-tracked paths were preserved separately, leaving release code as the implementation baseline. Existing dirty tracked application/infrastructure work was preserved in its original checkout. No commit, push, merge, CI or deployment was performed.

## Established source cause and limits

Two failing regression tests on the release code demonstrated: (1) there was no explicit termination control and closing presentation retained the mounted game iframe; (2) minimize wrote shared presentation state and shared/parent refresh could restore expanded focus. The patch separates local minimize from server-confirmed shared stop. Browser tests use the real collaboration-service with synthetic authenticated participants and SDK/legacy uploads, not a mock stop handler.

The reported incident is provisionally dated 2026-10-05 at 11:19 MSK (=08:19 UTC), window 11:17–11:22 MSK. The user confirmed only the last uploaded HTML game. Actual game asset, deployed web SHA and incident log chain remain unverified. An earlier production read-only SSH escalation was rejected by automatic review because project instructions require separate operational authorization. Implementation authorization does not replace that permission. No exact production-cause or production-delivery claim is made.

## Validation

- Two release regression tests failed before the fix and passed afterwards.
- Final focused frontend run: 79 tests in 5 files passed, including actual parent rendering, local exit, shared minimize/reopen, lifecycle client reconnect, terminal restoration, SDK/legacy frame handling and all four locales.
- Collaboration-service: full suite 54 tests in 13 files passed; build passed. Tests cover idempotency, old launch, unknown run/block, mixed versions, protected terminal-state updates, nested annotation preservation, requested launches and stopped checkpoints after authority loss.
- Frontend lint and TypeScript/Vite build passed. Existing bundle-size and stale Browserslist metadata warnings remain; no dependency or browser-test dependency was added.
- Full frontend run: 802 passed / 10 failed in 3 copied annotation test files. Those same 10 failures were reproduced with all task-modified tracked source temporarily restored to the unchanged release and then restored exactly. They are baseline/copied-test failures, not classified as fixed. Four additional locale tests subsequently passed in the focused run.
- Two-participant browser matrix: Chromium/WebKit × desktop/mobile × legacy/SDK, eight cases. Verifies learner and teacher exit, local minimize/progress, minimized exit, concurrent exit, restart, reconnect, pending-stop retry after transport reconnect, stopped execution counters and exit hit testing. Synthetic invalid JWT upgrade is rejected. Screenshots are retained with the handoff packet.
- Physical audible playback, the real last game asset, production classroom UI and DEV/production acceptance were not tested. Sandbox removal, existing cleanup paths and game execution cessation are verified locally.

## Diagnostics decision

No additional persistent incident logging is introduced in this narrow hotfix. Existing production logging contracts do not provide uploaded-game click/termination attribution; adding new events cannot reconstruct the already reported event. Local regression/browser evidence establishes the lifecycle defect. Authorized incident correlation remains pending and may justify a separately scoped telemetry change. No HTML content, user/lesson identity, token, credential, URL or input coordinate enters new telemetry.

## Delivery and preservation

Application code belongs to playsay-platform (web-app and collaboration-service). Focused lifecycle documentation is included; the cross-domain `spec.md` delta accompanies the handoff separately because the workspace root already has unrelated pending documentation changes. Infra procedure is unchanged. Deploy web-app and collaboration-service together only after authorized DEV/security/compatibility gates. Every affected hotfix must reach develop with runbook ancestry evidence; that integration and all delivery remain pending.

The task worktree is removed only after a scoped patch, all changed/new source files, contract delta, checksums and verification evidence have been preserved outside it and the platform patch has passed a cached apply check against the release baseline. Copied ignored inputs remain in the original checkout; no unrelated files are deleted.
