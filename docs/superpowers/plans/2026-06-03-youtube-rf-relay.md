# YouTube RF Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a risk-flagged RF-only YouTube relay path for authorized Play&Say lesson/homework/material video blocks.

**Architecture:** Backend decides playback mode from material access, profile country, IP country, video metadata, and feature flags. Frontend requests a playback decision and renders either the official embed or a backend-scoped relay stream URL.

**Tech Stack:** Kotlin/Spring Boot 4, Liquibase, PostgreSQL/H2 tests, React/Vite/TypeScript, i18next, Orval/OpenAPI.

---

### Task 1: App Profile Country

**Files:**
- Modify: `backend/api-gateway/src/test/kotlin/com/playsay/gateway/UserProfileControllerTest.kt`
- Create: `backend/api-gateway/src/main/resources/db/changelog/2026-06-03-002-add-app-user-country.xml`
- Modify: `backend/api-gateway/src/main/resources/db/changelog/db.changelog-master.xml`
- Modify: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/entity/AppUserEntity.kt`
- Modify: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/dto/UserProfileDto.kt`
- Modify: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/service/UserProfileStore.kt`

- [ ] Write a failing test that profile update stores `countryCode = RU`, trims/lowercase-normalizes to uppercase, and reset clears it.
- [ ] Run `./gradlew :api-gateway:test --tests com.playsay.gateway.UserProfileControllerTest`.
- [ ] Add Liquibase column `app_user.country_code varchar(2)`.
- [ ] Add DTO/entity/store support with ISO-like two-letter validation.
- [ ] Run the focused backend test again.

### Task 2: YouTube Playback Decision Backend

**Files:**
- Create: `backend/api-gateway/src/test/kotlin/com/playsay/gateway/service/YoutubeVideoSupportTest.kt`
- Create: `backend/api-gateway/src/test/kotlin/com/playsay/gateway/MaterialVideoPlaybackControllerTest.kt`
- Create: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/service/YoutubeVideoSupport.kt`
- Create: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/service/MaterialVideoPlaybackService.kt`
- Create: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/controller/MaterialVideoPlaybackController.kt`
- Modify: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/dto/MaterialDto.kt`
- Modify: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/repo/AssignmentRepos.kt`
- Modify: `backend/api-gateway/src/main/resources/application.yaml`
- Modify: `backend/api-gateway/src/main/resources/messages*.properties`

- [ ] Write pure tests for YouTube ID parsing, embed URL building, duration limit, and English language detection.
- [ ] Write controller tests for `EMBED` fallback, `RF_RELAY` when profile/IP/flag/video checks pass, strict profile/IP conflict fallback, and unauthorized material denial.
- [ ] Run focused tests and verify they fail because code/endpoints do not exist.
- [ ] Implement DTOs, support functions, playback decision service, short-lived in-memory sessions, and controller endpoints.
- [ ] Run focused tests until green.

### Task 3: Relay Stream Hook

**Files:**
- Modify: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/service/MaterialVideoPlaybackService.kt`
- Modify: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/controller/MaterialVideoPlaybackController.kt`
- Modify: `backend/api-gateway/Dockerfile`
- Modify: `playsay-infra/helm-charts/api-gateway/templates/deployment.yaml`
- Modify: `playsay-infra/helm-charts/api-gateway/values.yaml`
- Modify: `playsay-infra/helm-charts/api-gateway/values-dev.yaml`

- [ ] Add tests that stream endpoint rejects unknown/expired sessions and does not expose extracted upstream URLs.
- [ ] Implement stream endpoint with Range forwarding through Java HTTP client and `yt-dlp` URL resolution guarded by the session.
- [ ] Add disabled-by-default Helm values and env vars.
- [ ] Run focused backend tests.

### Task 4: Frontend Playback Integration

**Files:**
- Modify: `frontend/web-app/src/features/materials/ui/media/videoEmbed.ts`
- Modify: `frontend/web-app/src/features/materials/ui/blocks/RenderedMaterialBlock.tsx`
- Modify: `frontend/web-app/src/shared/api/materials.ts`
- Modify: `frontend/web-app/src/features/profile/ui/ProfileAccountPanel.tsx`
- Modify: `frontend/web-app/src/shared/i18n/resources/ru.ts`
- Modify: `frontend/web-app/src/shared/i18n/resources/en.ts`
- Modify: `frontend/web-app/src/shared/i18n/resources/de.ts`
- Modify: `frontend/web-app/src/shared/i18n/resources/fr.ts`

- [ ] Add frontend tests for playback decision rendering and profile country form state.
- [ ] Run focused Vitest tests and verify they fail.
- [ ] Render `<iframe>` for `EMBED`, `<video>` for `RF_RELAY`, and localized compact messages for unavailable states.
- [ ] Add localized country label/options for RU and non-RU/empty profile country.
- [ ] Run focused frontend tests.

### Task 5: Contracts, Docs, Verification

**Files:**
- Modify: `contracts/openapi.yaml`
- Modify: `frontend/web-app/src/generated/playsay-api.ts`
- Modify: `spec.md`
- Modify: `playsay-infra/docs/runbook.md`

- [ ] Run `./gradlew :api-gateway:exportOpenApi`.
- [ ] Run `npm --workspace web-app run generate`.
- [ ] Update `spec.md` with the product/infrastructure contract for RF relay.
- [ ] Update the runbook with feature flags, `yt-dlp`, and rollback/disable steps.
- [ ] Run backend tests, frontend lint/test/build, and i18n hardcoded-string searches.

