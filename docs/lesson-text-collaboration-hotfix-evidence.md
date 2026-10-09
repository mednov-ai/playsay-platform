# Lesson Text collaboration hotfix — local preparation

Status on 2026-10-09: reviewed local frontend implementation; owner-authorized develop integration and release preparation in progress. Develop acceptance, remote CI and numeric ready-candidate gates are pending. Production promotion is not authorized.

## Cause and change

A drag/resize used its pointerdown snapshot to replace the entire annotation, including text subsequently edited by the other participant. The gesture now merges only geometry into the current existing element. Text, sticky-note and mind-map captions/style survive; an explicitly deleted target is not recreated.

Connecting the live source preserves the editor and transfers local field changes once by ID. While readiness is pending, the draft remains editable without replacing unrelated live fields. Queued REST writes are discarded on handoff or same-lesson material replacement, and old reads/acknowledgments cannot overwrite the draft. Context-generation checks reject callbacks from another student canvas. Keyboard commands are owned by the focused editable layer and its portals; native editor/composition handling remains local.

## Local verification

Baseline `4bf184557455125e1de86e4ed32571a0c2a1527b`: seven focused regressions failed before the fix (four concurrent gestures, one handoff, two keyboard cases).

On Node 22.23.1, matching the CI major: all 159 web test files / 901 tests pass; API-client generation, lint, TypeScript and production web build pass. No generated API diff or lockfile/dependency change is introduced. The focused annotation tests include newly created/edited text, older save/read, continued input before live readiness, observed deletion, same-lesson material queue disposal, controlled student switching, native composition and one focused keyboard owner.

The external Playwright runner exercises actual LessonTaskCanvas with two Yjs clients in eight Chromium/WebKit cases: desktop, narrow/mobile viewport, PNG cover, generated image. Both input/gesture directions, explicit resize-handle target, painted glyphs, image focus/page return, reconnect, new entry, long text, sticky notes and mind-map text pass. This local transport does not establish deployed authorization, durable API snapshots, SHARED/PARALLEL backend isolation or audio/video transport. WebKit's BODY Backspace check dispatches the keyboard event without the browser-history navigation default; Chromium uses the native key press.

## Pending delivery decisions and limits

A fresh full frontend audit retains six high package findings (the same advisory, including the already recorded indirect tailwindcss-animate) for the exact existing braces/chokidar/fast-glob/micromatch/Tailwind chain. No compatible braces patch is published. Existing owner exceptions enumerate earlier candidates; the owner explicitly applied the same exception to this hotfix on 2026-10-09, through the unchanged 2026-12-05 10:46:15 UTC expiry. The exact scope and chain are recorded in the acceptance JSON. This is passed-with-accepted-risks, not a vulnerability fix.

The legacy REST endpoint selects the currently assigned material server-side from a lesson-only URL. Dropping queued writes cannot recall an already issued request during a concurrent material reassignment. The stronger API-level material guard is explicitly deferred by the owner to a future change; it is not claimed as implemented or accepted.

Fresh infra develop `4763c50e63d568c88f9c74e146967499602156c6` still points to `release/01.007.16`; platform production source is `b3da7da314702765d04a5616233a29f6e696be09`. The next unused numeric fix observed is `release/01.007.17`, but no release branch/candidate is created. The runbook's release-version helper is absent from current develop; its last retained pre-deletion version was used from Git history solely to calculate that number. Revalidate refs and acceptedDevCommit before an actual release build.

Raw local reports/screenshots are retained in the task evidence directory; they are not source files or release manifests. Original dirty checkouts remain untouched. Authenticated DEV direct/RF acceptance and cleanup, remote develop ancestry, immutable release digests, Helm renders and ready finalizer evidence remain required. Production backup/schema/zero-activity gates must be refreshed only in the subsequently authorized promotion workflow.
