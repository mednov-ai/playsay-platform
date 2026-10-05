# Uploaded HTML game lifecycle

Uploaded games distinguish local minimize from explicit termination. Minimize hides only the participant's expanded presentation and retains the iframe/progress; reopening the same shared launch does not publish a new start. Escape minimizes. The separate exit cross is available to teacher and admitted learner, including a minimized launcher action. SHARED exit ends that run for all participants. Standalone preview/homework and individual PARALLEL workspace contexts do not stop other contexts.

## Protocol and persistence

The existing authenticated Yjs classroom socket carries lifecycle message type `3`, a length-prefixed JSON string. Server greeting is `{type:"hello",version:1}`. Stop requests are `{type:"stop",blockId,runId,launchId}`; identifiers are nonempty strings of at most 200 characters with no control characters, and the JSON request is bounded to 1024 characters. Replies are `{type:"result",blockId,runId,result:"stopped"|"stale"|"incompatible"}`. The room is selected exclusively by the existing verified collaboration JWT; stop does not grant write authority over SDK game mechanics or access to another workspace.

A fresh shared start atomically writes `htmlGamePresentation.activeBlockId` and a UUID `launchId`. Reopening a minimized game retains this launch ID. Runtime IDs remain those published by the existing authority. The server verifies presentation launch identity and the current authority/snapshot run before terminating it. A stop during launch may use the launch ID as a placeholder runtime ID; when authority has disappeared, completed checkpoints are excluded and the canonical launch remains the safety boundary. Repeat stop is idempotent. A delayed stop for an older launch cannot clear the new presentation, even before its new authority awareness arrives.

Accepted termination writes both the runtime ID and launch ID to server-owned `htmlGameStoppedRuns`, removes matching snapshots/checkpoints and clears the matching presentation. Terminal markers remain in the existing room snapshot for its lifetime; durability follows the existing asynchronous SnapshotQueue, so an abrupt server loss before its flush is not a synchronous storage guarantee. Clients cannot forge or erase them through regular Yjs updates. The server validates incoming update structures and deletions without copying the entire lesson document. Unknown parent dependencies fail closed and require normal state-vector resynchronization.

Every client publishes `htmlGameStopVersion:1` in awareness. The server refuses confirmed shared stop while an older participating renderer lacks that capability. New UI on an old server also never reports successful shared stop. Rollout therefore requires collaboration-service and web-app together and a browser refresh of active clients, with DEV mixed-version acceptance first.

## Cleanup and reconnect

Exit immediately removes the local game's mounted sandbox. SDK attachment/MessagePort, snapshot retry and authority advertisement use existing unmount cleanup; lesson sockets and media are retained. Late checkpoints and ephemeral actions/effects of stopped runtime IDs are filtered. A new launch creates a new iframe and runtime identity. Shared terminal markers keep completed launches hidden even when delayed presentation writes or reconnect snapshots arrive.

If shared confirmation is unavailable, UI exposes a localized pending state and retry. Pending commands retain their original run/launch IDs across socket reconnect; retries of an older launch do not hide a newer local game. The server's lifecycle greeting retries pending commands. Incompatible clients receive an explicit page-update-required state. Local runtime removal is not represented as successful shared termination until canonical terminal state is received.

## Verification and diagnostics

Run `scripts/smoke/html-game-lifecycle-local-smoke.mjs` with the external Playwright installation after building the game-sync SDK and collaboration-service. It uses only synthetic local JWTs, a local snapshot stub and the real collaboration-service, and covers two participant renderers in Chromium/WebKit desktop/mobile with SDK and legacy games. No browser test dependency is added to the project.

Regression tests cover missing exit, retained hidden iframe, local minimize under parent refresh, terminal-state persistence, stale stop, protected-state rejection and workspace isolation. Product diagnostics remain opt-in and bounded. This change introduces no persistent logging of game content, provider URLs, user/lesson identity, coordinates or credentials. Incident timing logs without lifecycle/click telemetry cannot by themselves establish a failed click's cause.

Develop merge-back preserves the existing type-3 material-viewport command wire format alongside HTML-game lifecycle frames. The server distinguishes lifecycle commands by the `type: "stop"` JSON envelope and applies the existing teacher-only viewport authorization to other type-3 commands; lifecycle results use `type: "result"`. Neither protocol is renumbered, and both terminal-state ownership and material-viewport ownership checks run before ordinary Yjs updates.
