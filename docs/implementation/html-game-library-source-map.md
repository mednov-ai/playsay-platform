# Shared HTML game library source map

Local implementation baseline: platform `af7e2e21`, infra `aaa70eb` (available local `origin/develop`, 2026-10-06). These refs are not evidence of current remote or production state. The original coding request did not authorize delivery; the subsequent owner instruction «мерджи в develop проследи за развертыванием» authorizes both develop integrations and DEV publication only. New work is isolated in `shared-html-game-library-platform` and `shared-html-game-library-infra`; original dirty checkouts are preserved.

| Concern | Owning source | Integration |
| --- | --- | --- |
| Upload validation and raster optimization | MaterialAssetUploadService / MaterialHtmlGameOptimizationService | Reuse exact existing validation before game persistence |
| Private objects | MaterialObjectStorage | Independent game prefix and retention; no public bucket |
| Material authoring | LessonMaterialCatalogService / MaterialRequestValidator / material document serde | Validate pinned game/revision and preserve legacy references |
| Existing game upload routes | LessonMaterialStore / MaterialImagePageService | Register once in catalog; keep material-facing compatibility |
| Shared renderer and game protocol | LessonMaterialDocumentView / gameSyncSessionController | Preserve occurrence/run/launch isolation and existing stop protocol |
| Lesson access | ScheduledLessonStore / admission guard / CollaborationDocumentService | Extend authorization for lesson-owned game workspace without fake material |
| Library navigation | AppShell / workspace model | Lazy teacher-only Games view and shared picker |
| Neighboring whiteboard plan | add-lesson-whiteboard, presentation decision 7 and classification decision 10 | One revisioned presentation selection, extensible WHITEBOARD kind; no material category/provenance rewrite |
| Migration | New bounded application job | Inventory, exact copies, aliases, conditional material conversion and reconciliation |

Main contract edits remain scoped to the workspace `spec.md`; operational procedures belong to infra runbook. On 2026-10-16 the owner authorized develop integration and DEV delivery. Source feature commits platform `7cd6afa2` / infra `45783f4` are ported with three-way content reconciliation onto remote develop platform `1b7384be79d22346d080c7e48dfd0f90b2b2bef0` / infra `62a80a1810e7bc6a85d36ca8ae35d4a8f8760d1a`. Current session-recovery authorization handling and translations are retained. Current release/01.007.19 configuration, digests and DEV resources are preserved. Delivery checkouts are separate clean clones because original repositories contain invalid duplicate remote refs; originals are untouched. Final integration and deployed-source evidence is recorded separately. Production promotion is outside this authority.

Game persistence is encapsulated by HtmlGameRepository, LessonGameRepository, HtmlGameProcessingRepository and HtmlGameMigrationRepository; service code has no direct JDBC access. HTTP adapters are split into catalog, material-reference, processing and lesson-launch controllers. Legacy material upload orchestration lives in RegisteredMaterialGameUpload.


## Develop delivery mapping

The source implementation is platform `7cd6afa2` / infra `45783f4`, ported through feature PR61 / infra PR34 onto current develop while retaining intervening auth/schedule/Keycloak/runtime work. Platform follow-ups PR62–70 retain CI routing, visible lesson material, repository architecture policy, historical JPEG cover MIME, preview Escape, internal focus stability, first-action reconnect recovery and retired snapshot invalidation. Final frontend source after PR69 is `977a504e6c886cee4891ce5661cea4f5798b8ae6`; API210 uses `bf6736ec79873cb39e40aa64af80f614d2cce054`; collaboration60 uses `cd7930ce217d5625447a8f55066091fbf4b9cc24`; vocabulary75 and keyboard110 use `de3060983fa0d7d3f79d915b079f6cb6936f39fd`.

Infra PR35–44 scope DEV upload edges, pause writers/admission, inventory and restartable apply, bound migration JVM memory, and restore writers/admission after complete verification. Twenty copied source assets are verified aliases: 275 mapped legacy sources resolve to 255 active games and 241 effective material references. No production desired-state promotion or production backfill is part of this authority. Exact digests, CI/security and final native acceptance are recorded in [delivery evidence](../testing/evidence/2026-10-16-shared-html-game-library-develop.md).
