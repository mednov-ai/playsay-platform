# Lesson Text collaboration hotfix — ready release 01.007.17

The owner authorized develop integration and numeric release preparation, applied the exact existing frontend risk exception and deferred the expected-material REST guard. Production promotion remains separately authorized.

## Cause and behavior

Pointerdown snapshots previously replaced an entire annotation during move/resize, overwriting text entered by the other participant. Gestures now patch only geometry onto the current existing element, preserving concurrent captions/style and explicit deletion. Local-to-live handoff preserves pending input/editor state, transfers changed fields once by ID and rejects old context callbacks. Queued legacy writes are discarded on handoff or same-lesson material replacement. Keyboard deletion belongs to the focused editable drawing layer; BODY/buttons, native input and composition do not delete the selection.

## Verification

Seven focused regressions failed before the fix. Develop passes 159 test files / 901 tests, generation, lint and type/build. The production-based candidate passes 155 files / 876 tests, lint and type/build. The external two-client Chromium/WebKit image matrix passes eight desktop/mobile JPEG/PNG/generated-image cases, both input/gesture directions, explicit resize-handle targeting, painted glyphs, focus/page return, reconnect, sticky notes and mind maps. PDF/PPTX viewer regressions pass in Chromium/WebKit desktop/mobile; controlled student-context isolation, read-only behavior, legacy data and native composition have focused coverage.

Exact candidate 4297273f1639a23e08cb91a5639e810db3acc3bb passed authenticated Chrome teacher/student acceptance on dev.online.honey.school and dev.online.honeyschool.ru: 28 checks per origin across prepared and uploaded images, both gesture/input directions, blur/Backspace, delayed document handoff, API snapshots and fresh entry. Loaded app-BP4e1DV6.js SHA-256 abe72c8ce9539a21cbb4dc9d6e3cad194519477e9b2fcabec3b5a8fe93df29f9 matches the immutable DEV image's file; RF differs only by allowed substitutions (in this build the bytes match). DEV digest sha256:735cbb609ba2a8badb0caff77242ef3ae2b49ef9126e17c835edddb923abc42e remained stable. All task-owned lessons/relationships/profiles were removed, materials archived, three Keycloak accounts removed with absence verified, private credentials deleted, and collaboration connections/queue drained to zero.

These tests use synthetic denied-device joins; actual microphone/video transport and mixed old/new browser bundles are not claimed. Reload existing classroom pages after promotion to use the new client.

## Source, build and integration

Platform PR #54 merged at 33e7177e9fc0d1375624ec491591097e228a3520. The candidate starts from production b3da7da314702765d04a5616233a29f6e696be09 and applies only twelve hotfix/documentation files. It retains accepted develop ancestry by an explicit ours merge while excluding 173 unrelated develop differences. Owned source/test/smoke files equal develop; all remaining source stays at the production baseline. This release-head integration preserves the complete current DEV tree and imports release ancestry plus this evidence.

Develop dispatcher #248 / web #385, exact candidate web #386, and release dispatcher #105 / web #387 all succeeded. Release source 4297273f1639a23e08cb91a5639e810db3acc3bb; ready infra daafb47a02ec448188566f95988a0de494f29e55; acceptedDevCommit 33e7177e9fc0d1375624ec491591097e228a3520. Only web-app was rebuilt, digest sha256:5ab4ad8b82226d1f255fd5d84e81b7beeb9ae4e312b73dda807f2d5a0771a5a4. Finalization passed source/ancestry, immutable digest, unchanged component metadata and Helm renders for nineteen production applications. All unaffected production values equal release/01.007.16.

## Security and production boundary

Fresh full audit matches only GHSA-vfj7-8cjw-p6xm / CVE-2026-93687 and the exact six-package acceptance chain, including tailwindcss-animate 1.0.7. Gate: passed-with-accepted-risks, through unchanged 2026-12-05 10:46:15 UTC expiry. This is not remediation. No JVM module was published or expired JVM exception used.

The already-issued lesson-only REST request/material-reassignment race is explicitly deferred in docs/backlog/lesson-annotation-expected-material-guard.md. No API/schema/dependency migration is introduced.

Production pointer and all live applications remain release/01.007.16. Before owner-authorized promotion, refresh zero-activity/drain, protected restorable backup and mandatory all-workload schema convergence; revalidate immutable ready state and run both-origin production Text acceptance through the infra runbook. No production sync, pointer change or operational apply occurred during preparation. Rollback returns the reviewed release/01.007.16 desired state; it does not restore previously erased lesson text.
