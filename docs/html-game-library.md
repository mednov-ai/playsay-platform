# Shared uploaded HTML game library

This is the implementation contract for `add-shared-html-game-library`. Publication and production migration require separate delivery authorization and the infra runbook gates. Local source bases and integration constraints are recorded in `implementation/html-game-library-source-map.md`.

## Catalog, ownership and immutable content

All valid uploaded HTML games are shared immediately with teachers and administrators. Students and anonymous users cannot browse the catalog or use teacher preview. Summaries contain only game metadata, compatibility, version and permitted actions; they exclude material titles, roster, learner answers and source lesson context. Search, exact topic/level/compatibility filters, total count and pagination run on the server. Unknown metadata remains empty rather than guessed.

`html_game` owns catalog identity and optimistic metadata/current-revision version. `html_game_revision` pins private immutable HTML and compatibility evidence. `html_game_blob` owns SHA-256, length, media type and storage under `game-library/`; these objects are independent of material cleanup. Private authorized content/cover routes do not expose object keys or public bucket access. Upload retains UTF-8/self-contained validation, 20 MiB limit and embedded-image optimization. A verified object precedes the transactional revision/command commit; rollback removes staged objects best-effort, including an uncertain PUT response. A storage outage never exposes a partial catalog entry. Failed cleanup may leave an unreferenced private object; no automatic destructive sweep is introduced.

Authors and administrators can edit/replace/archive. Another teacher forks, retaining immutable source provenance with independent editing ownership. Creator deletion sets attribution to null rather than cascading shared content; administrators retain maintenance rights. Archive hides new catalog selection and prevents new attach/direct start, while existing pinned references and accepted launches retain access. Selecting a new current revision does not rewrite existing materials.

## HTTP and command contract

The generated `contracts/openapi.yaml` owns wire schemas. JSON errors use existing `ProjectErrorResponse`; all game error codes have ru/en/de/fr messages.

| Route | Authorization and command semantics |
| --- | --- |
| `GET /games`, `/games/{id}` | Teacher/admin only; paged summaries, optional exact revision |
| `POST /games`, `/games/{id}/revisions` | Multipart, UUID `Idempotency-Key`; replacement additionally checks `expectedVersion`; 201 on success |
| `PATCH /games/{id}` | Author/admin; `expectedVersion`; stale version returns 409 |
| `DELETE /games/{id}` | Author/admin archive; 204, no object deletion |
| `POST /games/{id}/fork` | Teacher/admin, pinned `revisionId`, stable `commandId` |
| `GET /games/{id}/revisions/{revision}/content` or `/cover` | Teacher preview or learner with an exact authorized material reference; private no-store/nosniff/sandbox response |
| `POST /materials/{id}/games` | Editable target, pinned pair, occurrence `blockId`, page, exact `expectedUpdatedAt`; same occurrence retry returns current document |
| `POST /games/{id}/materials` | Stable `commandId` creates one normal draft material with the pinned occurrence |
| `POST /games/{id}/processing` | Author/admin queues `ENRICH`/`ADAPT` for a pinned revision with stable command ID |
| `GET /games/{id}/processing/{job}` and `/preview` | Teacher-only status and local validated-candidate preview |
| `POST /games/{id}/processing/{job}/apply` | Author/admin explicit review, current-version/source guard and current validator/hash trust |
| `POST /games/{id}/select-revision` | Author/admin explicit current-revision selection, including source rollback; immutable bytes retained |
| `GET /schedule/lessons/{id}/game-launches/current` | Admitted participant; launch, monotonic presentation revision, manager permission, protocol readiness |
| `POST /schedule/lessons/{id}/game-launches` | Active admitted SHARED manager only; pinned game/revision and stable command ID; protocol v1 required |
| `POST /schedule/lessons/{id}/game-launches/{launch}/stop` | Admitted teacher/learner; only this launch, idempotent; delayed stop cannot clear a newer launch |
| `GET .../game-launches/{launch}/document` or `/content` | Exact active lesson/launch/context binding and current admission window |

UUID upload command identity is also accepted by legacy editor/live upload routes. Their retained result contains only opaque target IDs and retry responses re-authorize the target. Conflicting command payloads return 409. Old clients without a command key remain supported; updated clients retain the key for a selected file retry. Browser requests settle after a finite deadline and surface localized retry. Upload success is separate from attaching/saving a material. Legacy editor upload responses include pinned `gameId`/`gameRevisionId` in metadata; updated editors save that pair, including replacement of an existing canonical block, and queue revision-owned enrichment with a stable command.

Access denial uses 403 or non-disclosing 404. Missing content returns 404; archived/command/version/source/protocol conflicts return 409. File bounds use 413/422; transient storage/write-freeze conditions use 503. Failed operations do not silently mutate the selected lesson surface.

## References and consumers

An `htmlGame` block contains `gameId` + `gameRevisionId`, retaining its independent page/block occurrence IDs and local title/instructions. Canonical blocks omit the legacy URL; the pair must belong to the same game. `contracts/material-game-reference.schema.json` documents this additive shape. Legacy `material-asset:<id>` remains readable through the alias bridge. A client that strips a canonical reference from the same occurrence receives `GAME_CLIENT_UPDATE_REQUIRED` rather than silently corrupting it.

Editor picker, preview, classroom, homework and review share the material renderer/content resolver. Learner requests must identify a currently readable material containing that exact pair; substituting a different revision or context fails. Optional private covers use the same boundary. Two occurrences and different workspace contexts keep separate game runtime identities. Material/lesson copies retain canonical references; legacy game copies create lightweight proxy aliases to immutable game bytes, with no shared storage key subject to material deletion. Material classification/provenance fields remain untouched.

## Processing and trust

The revision-owned processing queue runs slow work on the existing bounded executor with SQL leases and bounded attempts. `ENRICH` may update optional cover and non-user title, without changing playable bytes. Failure leaves the fallback and all permitted game actions usable. `ADAPT` calls the existing trusted game-adapter boundary and preserves source hash, validator version, mechanics/media report, model and prompt evidence. Candidate HTML is validated again and stored independently, but has no playable revision until explicit apply. Apply rechecks source/current version and `mechanics-v3` trust. Source and accepted variants remain readable; rollback selects the source revision. Existing material-based adaptation/enrichment remains a compatibility bridge and registers accepted revisions/covers in the game aggregate. Unaccepted legacy candidates are retained in migration checkpoints with verified independent blobs, never promoted to catalog cards.

## Presentation and collaboration

`lesson_presentation` is the revisioned coordinator for MATERIAL/GAME. GAME hides the existing material surface while keeping its DOM/runtime state mounted; returning exposes the current authorized material or video-only surface. No material assignment/page is created by a library launch. The launch retains its initiating manager and prior primary kind, including a WHITEBOARD extension value, across replacement launches and delayed stop. The discriminated `kind` and lesson-owned collaboration pattern are extensible to WHITEBOARD; the neighboring whiteboard plan is not implemented by this change.

`LESSON_GAME` documents have null material ID, a nonnull launch ID and GROUP scope. Other kinds require material ID and forbid a game launch binding. Tokens, rooms, content and snapshots validate the exact lesson/current launch; generic material-document creation cannot create a reserved game document. The room is `lesson:<lessonId>:game:<launchId>:group:kind:LESSON_GAME`. Material viewport publication is forbidden in this room. Realtime `subscribe.lesson` advertises `gameLibraryVersion:1`; `lesson.game.changed` prompts a fresh authoritative state read, including video-only lessons and reconnects. Connected older clients prevent start; incompatible late clients pause the new surface and require refresh. Stale GET/stop acknowledgements cannot reactivate a stopped launch or overwrite a newer revision.

Local preview never broadcasts. Minimize retains the mounted sandbox/progress. Explicit stop requires the server acknowledgement, removes the accepted launch for all clients and leaves material/media connections alive. Direct launch runtime identity is pinned to the server launch across authority reloads, with a separate random iframe messaging channel. A new launch uses a fresh collaboration document and sandbox, isolating stopped checkpoints, different lessons and standalone work. Material-embedded games keep their existing type-3 explicit-stop protocol.

## Migration and recovery

The additive schema, compatible readers and dual registration bridge precede cutover. The bounded application Job inventories every HTML_GAME asset, including archived/private/unreferenced sources, verified copies, adaptation roots/candidates and covers. Verified same-author byte-identical copy chains share a revision. Independent equal-hash files and incompatible/ambiguous attribution remain independent. Broken or cyclic copy lineage is not treated as proof of shared ownership; missing adaptation provenance blocks the entry. Historically accepted adapted variants preserve their exact bytes and previous validation evidence without raising trust. An obsolete/missing validator or mismatched source hash yields `validationStatus=REVALIDATION_REQUIRED`: existing pinned uses remain readable, while new canonical attachment/direct launch requires fresh review and validation.

Each source receives READY/MAPPED/CANDIDATE/BLOCKED outcome, with checksum/checkpoint mapping. Object copy and alias/checkpoint commit are restartable; source keys are retained. Material conversion changes only reference fields with conditional document + updated timestamp comparison. IDs, title overrides, nongame data, classification, answers, annotations and retained collaboration snapshots are not rewritten. A separate complete cutoff audit verifies every source/retained candidate/cover and every canonical material reference; late/unmapped/corrupt data prevents success. Logs contain aggregate counts and stable error codes, never HTML or learner data.

`playsay.games.writes-enabled=false` prevents new game writes/launches but preserves readers. `playsay.games.maintenance=true` additionally prevents new lesson start/media admission. Migration apply requires drained active lessons and processing queues; the GitOps job also requires disabled writers, maintenance, explicit drain and immutable image digest. Backup/storage-headroom, stage order, resume and reader-compatible rollback belong to the infra runbook. Do not roll back to a reader that does not understand canonical references, remove tables/aliases or delete original objects.

Migration drain uses the authoritative access deadline (scheduled end plus grace and teacher extensions), not the historical status alone. Accessible IN_PROGRESS lessons and unknown end times fail closed; expired historical rows are retained without forcing completion. Processing queues must still be empty and operator-confirmed runtime drain is mandatory.

Legacy cover copies normalize declared MIME parameters. A historical generic `application/octet-stream` cover is accepted only when raster byte signatures identify JPEG or PNG; other generic content fails closed. Original and independent copy bytes remain identical. Read-only inventory validates legacy covers before declaring a source READY. Migration JVM memory is bounded independently from the API server profile.
