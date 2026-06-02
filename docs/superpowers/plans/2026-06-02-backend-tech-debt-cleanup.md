# Backend Tech Debt Cleanup Plan

Date: 2026-06-02
Scope: `playsay-platform/backend/api-gateway`
Goal: reduce Kotlin backend coupling without changing product behavior in the first cleanup passes.

## Current Findings

### Repository Monolith

`repo/DataRepo.kt` is 846 lines and contains many unrelated repository interfaces, projection rows, and JPQL queries. This is not raw SQL debt in the usual sense: production code does not currently use `JdbcTemplate` or hand-written SQL strings. The debt is that all persistence contracts are concentrated in one file.

Current architecture tests reinforce this shape by requiring `@Query` annotations to live in `repo/DataRepo.kt`. That made sense as an early guardrail, but it now blocks aggregate-oriented repositories.

Important files:

- `backend/api-gateway/src/main/kotlin/org/playsay/api/repo/DataRepo.kt`
- `backend/api-gateway/src/test/kotlin/org/playsay/api/BackendArchitectureTest.kt`

### Leaky JSON Boundaries

Several API DTOs expose `JsonNode` directly, and multiple entities persist JSON as raw `String` fields. This is acceptable only for intentionally dynamic material content, but the current usage also covers submissions, annotations, rubrics, metadata, assignment payloads, and collaboration snapshots.

Important files:

- `backend/api-gateway/src/main/kotlin/org/playsay/api/dto/MaterialDto.kt`
- `backend/api-gateway/src/main/kotlin/org/playsay/api/domain/LessonMaterialEntity.kt`
- `backend/api-gateway/src/main/kotlin/org/playsay/api/domain/SubmissionEntity.kt`
- `backend/api-gateway/src/main/kotlin/org/playsay/api/domain/LessonMaterialAnnotationEntity.kt`
- `backend/api-gateway/src/main/kotlin/org/playsay/api/domain/MaterialAssetEntity.kt`
- `backend/api-gateway/src/main/kotlin/org/playsay/api/domain/AssignmentEntity.kt`
- `backend/api-gateway/src/main/kotlin/org/playsay/api/domain/CollaborationDocumentEntity.kt`

`CollaborationDocumentEntity.snapshotJson` already uses `jsonb` and `@JdbcTypeCode(SqlTypes.JSON)`, but it is still typed as `String?`. It is a useful pattern to expand, not the final model.

### God Services

`LessonMaterialStore.kt` is the clearest service debt. It is 1151 lines and owns material CRUD, scheduled material access, submission handling, annotation handling, asset/object-storage behavior, image generation orchestration, mapping, validation, permission checks, and JSON conversion.

Important file:

- `backend/api-gateway/src/main/kotlin/org/playsay/api/service/LessonMaterialStore.kt`

`AssignmentStore.kt` is also overloaded. It mixes homework lifecycle, student submission behavior, teacher progress views, health/progress calculations, recipient management, authorization, response mapping, and JSON conversion.

Important file:

- `backend/api-gateway/src/main/kotlin/org/playsay/api/service/AssignmentStore.kt`

`MaterialAiDraftService.kt` is large enough to hide multiple responsibilities: provider access, prompt construction, schema handling, fallback draft generation, response normalization, and validation.

Important file:

- `backend/api-gateway/src/main/kotlin/org/playsay/api/service/MaterialAiDraftService.kt`

### JSON-Based Domain Logic

`MaterialScoringService.kt` has useful domain behavior, but it works directly against JSON trees. That makes scoring behavior harder to reason about, harder to refactor safely, and easier to break through frontend shape changes.

Important file:

- `backend/api-gateway/src/main/kotlin/org/playsay/api/service/MaterialScoringService.kt`

### Controllers

Controllers are not the main problem. They are mostly thin enough. There is some cleanup to do, but the dangerous complexity lives in services and repository boundaries.

Largest controllers:

- `CourseController.kt`
- `CollaborationDocumentController.kt`
- `AssignmentController.kt`
- `ScheduledMaterialController.kt`
- `ScheduledLessonController.kt`
- `MaterialCrudController.kt`

## Non-Goals

- Do not rewrite the backend into a new architecture.
- Do not change product behavior during repository and service extraction.
- Do not replace all `JsonNode` DTOs in one pass.
- Do not mix DB column migrations with service decomposition in the same commit.
- Do not start from controllers; they are not the bottleneck.

## Phase 0 - Architecture Ratchets

Purpose: make the cleanup measurable and stop new debt from entering while existing debt is reduced.

Tasks:

- Update `BackendArchitectureTest.kt` to allow `@Query` in any file under `repo/`, not only `DataRepo.kt`.
- Keep the ban on JDBC and raw SQL from service/controller layers.
- Add a repository rule that rejects `nativeQuery = true` unless explicitly allowlisted.
- Add service size guardrails:
  - target: new service files stay below 450 lines;
  - temporary allowlist for existing large files until they are split.
- Add a controller guardrail:
  - controllers should stay thin;
  - no `ObjectMapper.readTree`, `writeValueAsString`, or domain calculations in controllers.
- Add a JSON-boundary guardrail:
  - new domain services should use a codec/model instead of direct `JsonNode` parsing.

Verification:

- `./gradlew :api-gateway:test`

## Phase 1 - Split DataRepo By Aggregate

Purpose: reduce persistence coupling before touching behavior.

Create focused repository files:

- `repo/UserRepos.kt`
- `repo/CourseRepos.kt`
- `repo/ScheduleRepos.kt`
- `repo/MaterialRepos.kt`
- `repo/AssignmentRepos.kt`
- `repo/CollaborationRepos.kt`

Move related interfaces and projection rows out of `DataRepo.kt`:

- Course rows and repos into `CourseRepos.kt`.
- Scheduled lesson rows and repos into `ScheduleRepos.kt`.
- Material rows and repos into `MaterialRepos.kt`.
- Assignment rows and repos into `AssignmentRepos.kt`.
- Collaboration document repos into `CollaborationRepos.kt`.
- User/profile repos into `UserRepos.kt`.

Rules:

- Preserve method names and signatures unless the compiler forces a safe rename.
- Do not change queries.
- Do not change service behavior.
- Update imports only.

Verification:

- `./gradlew :api-gateway:test`
- `./gradlew :api-gateway:openapi`

## Phase 2 - Add Typed JSON Codecs Without API Churn

Purpose: create a stable boundary around dynamic JSON before replacing it.

Add a material JSON model package:

- `service/material/model/MaterialDocument.kt`
- `service/material/model/MaterialBlock.kt`
- `service/material/model/MaterialSubmissionContent.kt`
- `service/material/model/MaterialAnnotationContent.kt`
- `service/material/model/ScoringRubric.kt`
- `service/material/model/MaterialSourceMeta.kt`
- `service/material/model/MaterialAssessment.kt`
- `service/material/MaterialJsonCodec.kt`

Initial approach:

- Keep external API DTOs as `JsonNode` where needed.
- Parse request JSON into typed domain models immediately inside service boundaries.
- Serialize typed domain models back to JSON only at persistence/API boundaries.
- Preserve unknown material block types through an `UnknownMaterialBlock` fallback.
- Support schema versioning with `schemaVersion`.

Verification:

- Add codec round-trip tests.
- Add unknown-block preservation tests.
- Run existing material controller and scoring tests.

## Phase 3 - Split LessonMaterialStore Into Cohesive Services

Purpose: remove the largest backend service bottleneck while keeping public behavior stable.

Keep `LessonMaterialStore` temporarily as a facade, then extract:

- `MaterialCatalogService`
  - create/update/archive/list/get materials;
  - teacher/admin material permissions.
- `ScheduledMaterialService`
  - scheduled material lookup;
  - lesson participant access checks.
- `MaterialSubmissionService`
  - save/get/list submissions;
  - empty submission content;
  - collaboration finalize submission path.
- `MaterialAnnotationService`
  - get/save annotation snapshots.
- `MaterialAssetService`
  - asset list/content/metadata;
  - object storage integration.
- `MaterialImageOrchestrator`
  - image generation target discovery;
  - generated asset upsert and cleanup.
- `MaterialAccessPolicy`
  - active participant checks;
  - teacher/admin/student read/write checks.
- `MaterialMapper`
  - entity/row to DTO conversion.

Rules:

- Extract one responsibility at a time.
- Keep tests green after every extraction.
- Do not change endpoint contracts.
- Delete facade methods only after controllers depend on focused services.

Verification:

- `MaterialControllerTest`
- `ScheduledMaterialControllerTest`
- `CollaborationDocumentControllerTest`
- `./gradlew :api-gateway:test`

## Phase 4 - Split AssignmentStore

Purpose: make Sprint 6 homework and health/progress behavior maintainable.

Extract:

- `HomeworkAssignmentService`
  - create homework;
  - create from unfinished lesson;
  - list/detail for teacher and student.
- `HomeworkSubmissionService`
  - student material access;
  - save student submission;
  - finalize/assessment integration if needed.
- `AssignmentProgressService`
  - recipient progress;
  - average score;
  - health/progress color calculation.
- `AssignmentRecipientService`
  - resolve assigned students;
  - create/update recipient records.
- `AssignmentAccessPolicy`
  - teacher/student authorization.
- `AssignmentMapper`
  - response DTO mapping.

Rules:

- Move health/progress calculations into pure functions/classes.
- Unit-test progress color and average score without Spring.
- Keep controller contracts unchanged.

Verification:

- `AssignmentControllerTest`
- New `AssignmentProgressServiceTest`
- `./gradlew :api-gateway:test`

## Phase 5 - Make Scoring Typed

Purpose: move scoring from fragile JSON tree traversal to explicit material semantics.

Change scoring API internally from:

- material document JSON string;
- scoring rubric JSON string;
- submission `JsonNode`.

To:

- `MaterialDocument`;
- `ScoringRubric`;
- `MaterialSubmissionContent`.

Extract block scorers:

- `FillGapsScorer`
- `MultipleChoiceScorer`
- `MatchingPairsScorer`
- `AnswerPolicyResolver`

Return:

- `MaterialAssessment`

Then serialize assessment only at the boundary.

Verification:

- Existing `MaterialScoringServiceTest`
- New tests for each block scorer
- Legacy key compatibility tests for existing saved material documents

## Phase 6 - Split MaterialAiDraftService

Purpose: make AI material draft behavior understandable and testable.

Extract:

- `MaterialAiPromptBuilder`
- `MaterialAiSchemaProvider`
- `OpenAiResponsesClient`
- `MaterialDraftValidator`
- `StubMaterialDraftFactory`
- `ArticleAnswerNormalizer`

Rules:

- Keep provider-facing code isolated.
- Keep fallback/stub behavior deterministic.
- Keep schema/prompt generation testable without network access.

Verification:

- Existing `MaterialAiDraftServiceTest`
- New tests for prompt builder, schema provider, normalizer, and fallback factory

## Phase 7 - Tighten Controller Layer

Purpose: keep controllers as transport adapters only.

Tasks:

- Remove wildcard and unused imports.
- Add Bean Validation annotations to scalar DTO fields where practical.
- Keep auth extraction and response status mapping in controllers.
- Move branching/domain calculations to services.
- Review `CollaborationDocumentController.saveSnapshot` and move auth-vs-service-token decision into a small application service if it grows.

Verification:

- Controller tests
- OpenAPI generation

## Phase 8 - JSONB Persistence Migration

Purpose: align persisted JSON columns with Postgres semantics and future querying.

Candidate columns:

- `lesson_material.document`
- `lesson_material.source_meta`
- `lesson_material.scoring_rubric`
- `submission.content`
- `lesson_material_annotation.content`
- `material_asset.metadata`
- `assignment.payload`

Approach:

- Add Liquibase migrations from text to `jsonb`.
- Keep entity fields as `String` with `@JdbcTypeCode(SqlTypes.JSON)` initially.
- Move to typed persistence only after codecs are stable.
- Validate existing dev data migration before applying broadly.

Verification:

- Migration test on local/dev DB
- Backend tests
- Manual smoke for material create, homework submit, annotation save, collaboration finalize

## Phase 9 - Documentation

Purpose: keep implementation and project contract aligned.

Tasks:

- Update root `spec.md` after behavior-affecting refactors or persistence migrations.
- Add backend architecture notes or ADR:
  - `docs/adr/backend-aggregate-boundaries.md`
  - repository boundaries;
  - JSON boundary rules;
  - service size/responsibility rules.

## Recommended Execution Order

1. Phase 0: architecture ratchets.
2. Phase 1: repository split.
3. Phase 3 and Phase 4: split the two largest stores behind existing APIs.
4. Phase 2 and Phase 5: typed JSON/scoring cleanup.
5. Phase 6: AI draft service split.
6. Phase 7: controller cleanup.
7. Phase 8: JSONB migration.
8. Phase 9: docs/spec sync.

The first implementation branch should only include Phases 0 and 1. That gives immediate structural improvement with low behavioral risk.

## First Branch Proposal

Branch:

- `codex/backend-architecture-ratchets`

Commit scope:

- update `BackendArchitectureTest.kt`;
- split `DataRepo.kt` by aggregate;
- preserve all repository methods and queries;
- no product behavior changes.

Validation before merge:

- `./gradlew :api-gateway:test`
- `./gradlew :api-gateway:openapi`
- `git diff --check`
