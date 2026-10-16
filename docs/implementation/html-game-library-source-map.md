# Shared HTML game library source map

Local implementation baseline: platform `af7e2e21`, infra `aaa70eb` (available local `origin/develop`, 2026-10-06). These refs are not evidence of current remote or production state. No fetch, publication or deployment is authorized by the coding request. New work is isolated in `shared-html-game-library-platform` and `shared-html-game-library-infra`; original dirty checkouts are preserved.

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
