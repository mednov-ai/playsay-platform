# Sprint 5 Collaboration Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a live classroom workspace where students work in individual or shared group documents, teachers observe progress in real time, annotations stay aligned with material pages, and final work is saved as a normal submission.

**Architecture:** Kotlin `api-gateway` remains the source of truth for access control, document metadata, snapshots, and finalization. A new Node.js collaboration service owns transient Yjs websocket sessions and periodically persists snapshots through `api-gateway`. React classroom UI connects to backend-created collaboration documents and renders student workspace, teacher supervision, presence cursors, and annotation sync.

**Tech Stack:** Kotlin/Spring Boot/JPA/Liquibase/OpenAPI, React/Vite/TypeScript, TipTap/Yjs/y-websocket, Kubernetes/Helm/ArgoCD/Jenkins.

---

## Scope Rules

- Do not redesign Sprint 4 material schema.
- Do not replace existing material submission endpoints until collaboration finalize is stable.
- Do not mix teacher annotation payload, student text document payload, and material answers in one JSON blob.
- Keep group mode and individual mode explicit in data model and UI.
- Update root `/Users/evgeniymednov/Documents/Projects/Play&Say/spec.md` when behavior changes during implementation.

## Target Files

Backend:
- Create: `backend/api-gateway/src/main/resources/db/changelog/2026-06-01-001-create-collaboration-documents.xml`
- Modify: `backend/api-gateway/src/main/resources/db/changelog/db.changelog-master.xml`
- Create: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/entity/CollaborationDocumentEntity.kt`
- Modify: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/repo/DataRepo.kt`
- Create: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/dto/CollaborationDto.kt`
- Create: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/service/CollaborationDocumentService.kt`
- Create: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/controller/CollaborationDocumentController.kt`
- Modify: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/service/LessonMaterialStore.kt`
- Modify: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/service/MetaData.kt`
- Test: `backend/api-gateway/src/test/kotlin/com/playsay/gateway/controller/CollaborationDocumentControllerTest.kt`

Collaboration service:
- Create: `collaboration-service/package.json`
- Create: `collaboration-service/tsconfig.json`
- Create: `collaboration-service/src/config.ts`
- Create: `collaboration-service/src/auth.ts`
- Create: `collaboration-service/src/rooms.ts`
- Create: `collaboration-service/src/snapshots.ts`
- Create: `collaboration-service/src/server.ts`
- Create: `collaboration-service/Dockerfile`
- Test: `collaboration-service/src/rooms.test.ts`

Frontend:
- Modify: `frontend/package.json`
- Modify: `frontend/web-app/package.json`
- Modify: `frontend/web-app/src/features/classroom/ui/LiveLessonExperience.tsx`
- Modify: `frontend/web-app/src/features/classroom/ui/LessonWorkspace.tsx`
- Modify: `frontend/web-app/src/features/classroom/ui/LessonTaskCanvas.tsx`
- Modify: `frontend/web-app/src/features/classroom/ui/MaterialSubmissionsMonitor.tsx`
- Create: `frontend/web-app/src/features/classroom/model/collaboration.ts`
- Create: `frontend/web-app/src/features/classroom/hooks/useCollaborationDocument.ts`
- Create: `frontend/web-app/src/features/classroom/hooks/useYjsWorkspace.ts`
- Create: `frontend/web-app/src/features/classroom/ui/StudentLiveWorkspace.tsx`
- Create: `frontend/web-app/src/features/classroom/ui/TeacherCollaborationPanel.tsx`
- Create: `frontend/web-app/src/features/classroom/ui/PresenceCursorLayer.tsx`
- Modify: `frontend/web-app/src/features/classroom/model/annotation.ts`
- Modify: `frontend/web-app/src/features/classroom/hooks/useLessonAnnotation.ts`
- Modify: `frontend/web-app/src/shared/i18n/resources/ru.ts`
- Modify: `frontend/web-app/src/shared/i18n/resources/en.ts`
- Modify: `frontend/web-app/src/shared/i18n/resources/de.ts`
- Modify: `frontend/web-app/src/shared/i18n/resources/fr.ts`
- Test: `frontend/web-app/src/features/classroom/model/collaboration.test.ts`
- Test: `frontend/web-app/src/features/classroom/model/annotation.test.ts`

Infra/CI:
- Modify: `Jenkinsfile`
- Create: `../playsay-infra/helm-charts/collaboration-service/Chart.yaml`
- Create: `../playsay-infra/helm-charts/collaboration-service/values.yaml`
- Create: `../playsay-infra/helm-charts/collaboration-service/values-dev.yaml`
- Modify: `../playsay-infra/helm-charts/platform-apps/values.yaml`
- Modify: `../playsay-infra/docs/runbook.md`

---

## Task 0: Branch And Baseline

- [ ] Create branch from latest `develop`.

Run:
```bash
cd /Users/evgeniymednov/Documents/Projects/Play\&Say/playsay-platform
git checkout develop
git pull --ff-only origin develop
git checkout -b codex/sprint-5-collaboration-workspace
```

- [ ] Verify baseline backend.

Run:
```bash
cd /Users/evgeniymednov/Documents/Projects/Play\&Say/playsay-platform/backend
gradle :api-gateway:test --no-daemon --stacktrace --max-workers=1 -Dkotlin.compiler.execution.strategy=in-process
```

Expected: `BUILD SUCCESSFUL`.

- [ ] Verify baseline frontend through current known-good CI if local Node 24 still hangs.

Run:
```bash
cd /Users/evgeniymednov/Documents/Projects/Play\&Say/playsay-platform/frontend
npm --workspace web-app run build
```

Expected: local pass. If local Node tooling hangs, record it in the phase report and rely on Jenkins build after push.

---

## Task 1: Backend Collaboration Document Persistence

- [ ] Add Liquibase table `collaboration_document`.

Required columns:
- `id uuid primary key`
- `lesson_id uuid not null`
- `material_id uuid not null`
- `student_user_id uuid null`
- `document_kind varchar(40) not null`
- `collaboration_scope varchar(20) not null`
- `yjs_document_id varchar(200) not null unique`
- `snapshot_json jsonb null`
- `snapshot_storage_key text null`
- `version bigint not null default 0`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints:
- `collaboration_scope in ('INDIVIDUAL','GROUP')`
- individual rows require `student_user_id is not null`
- group rows require `student_user_id is null`
- unique `(lesson_id, material_id, student_user_id, document_kind, collaboration_scope)`

- [ ] Add `CollaborationDocumentEntity`.

Implementation rules:
- Use explicit `@Column` names.
- Use UUID FK scalar fields, not broad bidirectional relations.
- Store `snapshotJson` as text or existing JSON mapping pattern used by `LessonMaterialEntity`.

- [ ] Add repo methods in `DataRepo.kt`.

Required methods:
```kotlin
fun findByLessonIdAndMaterialIdAndStudentUserIdAndDocumentKindAndCollaborationScope(...)
fun findByLessonIdAndMaterialIdAndStudentUserIdIsNullAndDocumentKindAndCollaborationScope(...)
fun findByLessonIdAndMaterialIdOrderByUpdatedAtDesc(...)
```

- [ ] Write repository/controller tests for create/get uniqueness.

Run:
```bash
cd /Users/evgeniymednov/Documents/Projects/Play\&Say/playsay-platform/backend
gradle :api-gateway:test --tests '*CollaborationDocumentControllerTest' --no-daemon --stacktrace --max-workers=1 -Dkotlin.compiler.execution.strategy=in-process
```

Expected: tests pass after implementation.

- [ ] Commit.

```bash
git add backend/api-gateway/src/main/resources/db/changelog backend/api-gateway/src/main/kotlin/com/playsay/gateway/entity backend/api-gateway/src/main/kotlin/com/playsay/gateway/repo backend/api-gateway/src/test/kotlin/com/playsay/gateway/controller
git commit -m "feat: add collaboration document persistence"
```

---

## Task 2: Backend Collaboration API And Permissions

- [ ] Add DTOs in `CollaborationDto.kt`.

Required DTOs:
- `CollaborationDocumentResponse`
- `CreateCollaborationDocumentRequest`
- `SaveCollaborationSnapshotRequest`
- `FinalizeCollaborationDocumentRequest`
- `CollaborationTokenResponse`

- [ ] Add service methods in `CollaborationDocumentService.kt`.

Required behavior:
- student can get/create only own `INDIVIDUAL` document;
- student can get/create lesson `GROUP` document only if participant of lesson;
- teacher/admin can list all documents for a lesson/material;
- teacher/admin can get/create group document;
- save snapshot increments version and updates `updatedAt`;
- finalize maps snapshot to existing material submission flow.

- [ ] Add controller endpoints.

Endpoints:
```text
GET  /schedule/lessons/{lessonId}/collaboration-documents/current?materialId=&documentKind=&scope=
POST /schedule/lessons/{lessonId}/collaboration-documents/current
GET  /schedule/lessons/{lessonId}/collaboration-documents?materialId=
PUT  /schedule/lessons/{lessonId}/collaboration-documents/{documentId}/snapshot
POST /schedule/lessons/{lessonId}/collaboration-documents/{documentId}/finalize
POST /schedule/lessons/{lessonId}/collaboration-documents/{documentId}/token
```

- [ ] Add stable localized error codes to `MetaData.kt` and i18n bundles.

Required codes:
- `COLLABORATION_DOCUMENT_NOT_FOUND`
- `COLLABORATION_ACCESS_DENIED`
- `COLLABORATION_SCOPE_INVALID`
- `COLLABORATION_SNAPSHOT_INVALID`

- [ ] Export OpenAPI.

Run:
```bash
cd /Users/evgeniymednov/Documents/Projects/Play\&Say/playsay-platform/backend
gradle :api-gateway:exportOpenApi --no-daemon --stacktrace --max-workers=1 -Dkotlin.compiler.execution.strategy=in-process
```

Expected: `contracts/openapi.yaml` changes only by new collaboration endpoints/schemas.

- [ ] Run backend tests.

Run:
```bash
gradle :api-gateway:test --no-daemon --stacktrace --max-workers=1 -Dkotlin.compiler.execution.strategy=in-process
```

Expected: `BUILD SUCCESSFUL`.

- [ ] Commit.

```bash
git add backend/api-gateway/src/main/kotlin backend/api-gateway/src/main/resources contracts/openapi.yaml backend/api-gateway/src/test
git commit -m "feat: add collaboration document API"
```

---

## Task 3: Collaboration Service Skeleton

- [ ] Create `collaboration-service` Node TypeScript package.

Required dependencies:
- `yjs`
- `y-websocket`
- `ws`
- `jose`
- `typescript`
- `tsx`
- `vitest`

- [ ] Implement config.

Required env:
- `PORT`
- `KEYCLOAK_JWKS_URL`
- `PLAYSAY_API_BASE_URL`
- `COLLABORATION_SERVICE_TOKEN`
- `SNAPSHOT_INTERVAL_MS`

- [ ] Implement auth middleware.

Rules:
- verify short-lived JWT or backend-issued token;
- reject missing `lessonId`, `materialId`, `scope`, `documentId`;
- never trust room id from URL without token claims.

- [ ] Implement room naming.

Rules:
- individual: `lesson:{lessonId}:material:{materialId}:student:{studentUserId}:kind:{documentKind}`;
- group: `lesson:{lessonId}:material:{materialId}:group:kind:{documentKind}`.

- [ ] Implement periodic snapshot persistence to backend.

Rules:
- debounce per room;
- send encoded Yjs update or normalized snapshot JSON;
- flush on room empty and shutdown.

- [ ] Add Dockerfile.

- [ ] Run tests.

Run:
```bash
cd /Users/evgeniymednov/Documents/Projects/Play\&Say/playsay-platform/collaboration-service
npm test
npm run build
```

Expected: tests/build pass.

- [ ] Commit.

```bash
git add collaboration-service
git commit -m "feat: add collaboration websocket service"
```

---

## Task 4: Infra And Jenkins For Collaboration Service

- [ ] Add Jenkins stages.

Required stages:
- collaboration service test/build;
- build and push collaboration image;
- update dev Helm image tag.

- [ ] Add Helm chart in `playsay-infra`.

Required resources:
- Deployment;
- Service;
- env config;
- health/readiness probes;
- route through existing online host path `/collab/ws`.

- [ ] Update runbook.

Document:
- how to deploy branch with collaboration service;
- how to verify pod/image tag;
- how to test websocket route;
- rollback command.

- [ ] Commit platform Jenkins changes.

```bash
cd /Users/evgeniymednov/Documents/Projects/Play\&Say/playsay-platform
git add Jenkinsfile
git commit -m "ci: build collaboration service image"
```

- [ ] Commit infra changes.

```bash
cd /Users/evgeniymednov/Documents/Projects/Play\&Say/playsay-infra
git checkout develop
git pull --ff-only origin develop
git checkout -b codex/sprint-5-collaboration-infra
git add helm-charts/collaboration-service helm-charts/platform-apps docs/runbook.md
git commit -m "feat: deploy collaboration service"
```

---

## Task 5: Frontend API Generation And Model Layer

- [ ] Run OpenAPI generate after backend endpoints exist.

Run:
```bash
cd /Users/evgeniymednov/Documents/Projects/Play\&Say/playsay-platform/frontend
npm --workspace web-app run generate
```

Expected: generated API includes collaboration endpoints.

- [ ] Add `model/collaboration.ts`.

Required pure functions:
- `collaborationRoomKey(input)`
- `collaborationScopeForMode(mode)`
- `isGroupCollaborationDocument(document)`
- `formatCollaborationUpdatedAt(date, locale)`

- [ ] Add tests.

Run:
```bash
cd /Users/evgeniymednov/Documents/Projects/Play\&Say/playsay-platform/frontend
npm --workspace web-app run test -- collaboration
```

Expected: tests pass.

- [ ] Commit.

```bash
git add frontend/web-app/src/features/classroom/model frontend/web-app/src/features/classroom/**/*.test.ts frontend/web-app/src/shared/api
git commit -m "feat: add collaboration frontend model"
```

---

## Task 6: Student Live Workspace

- [ ] Add dependencies to frontend web app.

Required dependencies:
- TipTap editor packages already approved for Sprint 5 if not present;
- `yjs`;
- `y-websocket`.

- [ ] Add `useCollaborationDocument`.

Behavior:
- get/create document on classroom entry;
- support `INDIVIDUAL` and `GROUP`;
- expose loading/error/retry.

- [ ] Add `useYjsWorkspace`.

Behavior:
- connect only after document/token loaded;
- expose connection status;
- fallback state when websocket unavailable.

- [ ] Add `StudentLiveWorkspace`.

UI rules:
- no big decorative card;
- compact status;
- no primary "Отправить" in live autosave mode;
- explicit `Завершить работу` action only when finalize is available.

- [ ] Replace fake `1/14`.

Rules:
- show real material page progress if available;
- otherwise hide indicator.

- [ ] Run checks.

```bash
cd /Users/evgeniymednov/Documents/Projects/Play\&Say/playsay-platform/frontend
npm --workspace web-app run lint
npm --workspace web-app run test
npm --workspace web-app run build
```

Expected: pass locally or record Node tooling blocker and verify via Jenkins.

- [ ] Commit.

```bash
git add frontend/web-app/src/features/classroom frontend/web-app/src/shared/i18n frontend/web-app/package.json frontend/package-lock.json
git commit -m "feat: add student live workspace"
```

---

## Task 7: Teacher Supervision And Presence

- [ ] Add `TeacherCollaborationPanel`.

Required UI:
- list participants;
- individual document status;
- group document status;
- last updated;
- connection/presence state.

- [ ] Add `PresenceCursorLayer`.

Rules:
- different stable color per participant;
- visible name label;
- no correctness leak;
- no overlap with material controls where possible.

- [ ] Add teacher mode to workspace.

Rules:
- teacher can switch between student individual documents and group document;
- first implementation may be read-only unless teacher edit is explicitly enabled by backend token scope.

- [ ] Localize all labels in `ru/en/de/fr`.

- [ ] Run checks.

```bash
cd /Users/evgeniymednov/Documents/Projects/Play\&Say/playsay-platform/frontend
npm --workspace web-app run lint
npm --workspace web-app run test
npm --workspace web-app run build
```

- [ ] Commit.

```bash
git add frontend/web-app/src/features/classroom frontend/web-app/src/shared/i18n
git commit -m "feat: add teacher collaboration supervision"
```

---

## Task 8: Annotation Coordinate Model V2

- [ ] Update `annotation.ts`.

Required model:
- points stored in material/page coordinate space;
- renderer converts material coordinates to viewport coordinates;
- scroll/resize/reconnect do not change saved points.

- [ ] Update `useLessonAnnotation`.

Behavior:
- save annotation snapshots;
- load snapshots for homework continuation;
- keep backend snapshot as source of truth.

- [ ] Add tests for coordinate conversion.

Run:
```bash
cd /Users/evgeniymednov/Documents/Projects/Play\&Say/playsay-platform/frontend
npm --workspace web-app run test -- annotation
```

Expected: conversion tests pass.

- [ ] Browser smoke.

Required manual steps:
- draw on material;
- scroll material pane;
- verify drawing remains aligned;
- reload classroom;
- verify drawing restored.

- [ ] Commit.

```bash
git add frontend/web-app/src/features/classroom/model/annotation.ts frontend/web-app/src/features/classroom/hooks/useLessonAnnotation.ts frontend/web-app/src/features/classroom/**/*.test.ts
git commit -m "fix: align annotations to material coordinates"
```

---

## Task 9: End-To-End Dev Smoke

- [ ] Push platform branch.

```bash
cd /Users/evgeniymednov/Documents/Projects/Play\&Say/playsay-platform
git push -u origin codex/sprint-5-collaboration-workspace
```

- [ ] Push infra branch when needed.

```bash
cd /Users/evgeniymednov/Documents/Projects/Play\&Say/playsay-infra
git push -u origin codex/sprint-5-collaboration-infra
```

- [ ] Trigger Jenkins branch deploy for platform branch.

Verify:
- backend tests pass;
- OpenAPI contract pass;
- frontend build pass;
- collaboration service image built;
- image tags updated in infra.

- [ ] Verify ArgoCD.

Expected apps:
- `api-gateway` Synced/Healthy;
- `web-app` Synced/Healthy;
- `collaboration-service` Synced/Healthy.

- [ ] Smoke flow on `online.play-and-say.ru`.

Required:
1. Teacher logs in.
2. Teacher creates group lesson with material.
3. Student A joins and types in individual workspace.
4. Student B joins and types in individual workspace.
5. Teacher sees both documents.
6. Teacher opens group document.
7. Both students see group document updates.
8. Colored cursors/names are visible.
9. Drawing remains aligned after scroll.
10. Refresh/reconnect restores text and annotations.
11. Finalize creates submission.

- [ ] Record screenshots in chat when saving screenshots.

- [ ] Create PR to `develop` after smoke passes.

---

## Definition Of Done Checklist

- [ ] Individual student document works.
- [ ] Group document works.
- [ ] Teacher supervision works.
- [ ] Presence cursors with labels work.
- [ ] Drawing remains aligned after scroll.
- [ ] Annotation snapshot restores after reconnect.
- [ ] Fake `1/14` is removed or replaced by real progress.
- [ ] Live mode no longer relies on ambiguous primary "Отправить".
- [ ] Finalize creates/updates `Submission`.
- [ ] Backend tests pass.
- [ ] OpenAPI export passes.
- [ ] Frontend lint/test/build pass in Jenkins.
- [ ] Dev smoke teacher + two students passes.
- [ ] `spec.md` and runbook are synchronized with final behavior.
