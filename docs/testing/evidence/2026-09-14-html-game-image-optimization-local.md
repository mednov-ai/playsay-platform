# HTML-game image optimization local evidence — 2026-09-14

Branch `codex/compress-html-game-embedded-images` was created from platform `origin/develop` at `1e1d1f6332ebcb42c11434278d82e5e843b984d0`. Production game contents were not added to source control; processor coverage generates deterministic synthetic PNG, JPEG, WebP and animated WebP inputs in memory.

Successful local checks:

```text
cd frontend && npm ci
cd frontend && npm --workspace game-sync-sdk run build
cd frontend && npm --workspace game-adapter-service test
cd frontend && npm --workspace game-adapter-service run typecheck
cd frontend && npm --workspace game-adapter-service run build
cd frontend && CHROMIUM_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm --workspace game-adapter-service test -- --run src/adapter.test.ts src/media-protector.test.ts src/server.test.ts
cd frontend && npm audit --workspace game-adapter-service --omit=dev
cd frontend && npm --workspace web-app test
cd frontend && npm --workspace web-app run lint -- --quiet
cd frontend && npm --workspace web-app run build
cd backend && gradle :api-gateway:compileKotlin
cd backend && gradle :api-gateway:exportOpenApi
cd backend && gradle -PlowMemoryTests :api-gateway:test
node --test scripts/ci/detect-affected-targets.test.mjs
./scripts/ci/validate-ci-contracts.sh
openspec validate compress-html-game-embedded-images --strict
git diff --check
```

Observed results: game-adapter-service reported 25 passed and 4 existing skipped tests; web-app reported 753 passed tests; the low-memory gateway suite completed successfully; the game-adapter production dependency audit reported zero vulnerabilities; generated OpenAPI and web client artifacts were refreshed through project tasks.

Local environment limitations and unrelated baseline findings:

- A direct Docker image build could not start because the local Docker daemon socket was unavailable. The Dockerfile was updated for the pinned glibc sharp/libvips runtime, while TypeScript production build and runtime dependency resolution passed.
- The default parallel gateway test invocation exhausted the local test JVM heap late in the unrelated user-management tests. The project-provided `-PlowMemoryTests` mode then completed the complete suite successfully.
- `gradle :api-gateway:detekt` still reports 15 pre-existing complexity findings in unchanged `MaterialExternalActivityResolver`, `MaterialImageTargets`, `MaterialUrlImportService`, `MaterialVideoPlaybackService`, `ScheduledLessonStore` and `ScheduledLessonStudentAccessService`; it reported no finding in this change's files.

Dev upload, browser acceptance, `develop` integration and release preparation were not performed by these local checks.

## Media-free AI adaptation continuation — 2026-09-15

The approved boundary keeps the authenticated internal gateway-to-adapter request unchanged, extracts threshold-triggering contiguous image/audio data URIs inside `game-adapter-service`, sends only opaque placeholders to OpenAI, restores canonical URI text byte-for-byte, and performs existing static plus Chromium/mechanics validation on the complete source and candidate.

Additional successful checks:

```text
cd frontend && npm ci
cd frontend && npm --workspace game-sync-sdk run build
cd frontend && npm --workspace game-adapter-service test
cd frontend && npm --workspace game-adapter-service run typecheck
cd frontend && npm --workspace game-adapter-service run build
cd frontend && npm audit --workspace game-adapter-service --omit=dev
cd frontend && npm --workspace web-app run lint
cd frontend && npm --workspace web-app run test
cd frontend && npm --workspace web-app run build
cd backend && gradle -PlowMemoryTests :api-gateway:test
node --test scripts/ci/detect-affected-targets.test.mjs
./scripts/ci/validate-ci-contracts.sh
openspec validate compress-html-game-embedded-images --strict
git diff --check
```

Observed results: game-adapter-service reported 33 passed and 4 environment-gated tests skipped in the normal suite. A separate run with the installed Google Chrome executable reported 21/21 selected tests passing, including a valid deterministic large WebP plus audio fixture restored before the real Chromium `mechanics-v3` comparison. Captured provider-body assertions prove those payloads are absent from the OpenAI request. Web-app reported 753 passed tests. The complete low-memory gateway suite passed, including terminal public error mapping and proof that a media-integrity failure creates no adapted asset. CI routing reported 13 passing tests; the CI contract suite reported 50 passing and 3 intentional skips. The game-adapter production dependency audit reported zero vulnerabilities.

The first repeated frontend build encountered duplicate generated `node_modules/@types/* 2` directories and the first repeated gateway suite encountered duplicate generated `*Test 2.class` files. Reinstalling dependencies with `npm ci` and cleaning only Gradle-generated `api-gateway/build` output removed those local filesystem artifacts; both complete reruns passed. No source or user checkout file was removed.

## Develop integration verification — 2026-09-15

The complete platform feature commit `907846b4a6e4aa6986ed0edc80e7fb183f379383` was rebased without conflicts onto refreshed platform `origin/develop` at `2a455ef4e206605006a910ffad82d03e5f6d902b`. The matching infra runbook commit is `c224745545cc63a597ab70414c2fabba1a443927`, based on refreshed infra `origin/develop` at `79e097568ed0ea039b7258070db150d378a12fcf`.

The post-rebase verification repeated the full bounded gateway suite, OpenAPI export, game-sync build, normal adapter suite, adapter typecheck/build, real-Chrome adapter/media/server suite, production adapter dependency audit, web lint/test/build, affected-target tests, CI contract validation, strict OpenSpec validation and diff checks. Results were: adapter 33 passed with 4 environment-gated skips; selected real-Chrome suite 21/21; web 144 files and 767 tests passed; gateway `BUILD SUCCESSFUL`; affected-target routing 13/13; CI contracts 50 passed with 3 intentional skips; production adapter audit zero vulnerabilities. The Vite chunk-size warning remains informational and unchanged in policy.

This integration verification does not claim dev Donut upload, authenticated material/classroom browser acceptance or release readiness; those remain separate OpenSpec tasks 6.3, 6.4 and 6.6.
