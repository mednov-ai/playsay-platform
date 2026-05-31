# FillGaps Item Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move fillGaps attempts/hints/error limits from block-level controls to each phrase and simplify scoring so teachers do not configure attempt/hint penalties.

**Architecture:** `MaterialExerciseItem` becomes the source for per-phrase fillGaps limits. Frontend preview and backend submission scoring both compute a simple 10-point block score from equal item units, with attempts and hints reducing a phrase's available credit by fixed proportions instead of configurable penalty fields.

**Tech Stack:** React, TypeScript, Vitest, Kotlin/Spring Boot tests.

---

### Task 1: Frontend Model And Tests

**Files:**
- Modify: `frontend/web-app/src/features/materials/model/types.ts`
- Modify: `frontend/web-app/src/features/materials/model/scoring.ts`
- Modify: `frontend/web-app/src/features/materials/model/documentSerde.ts`
- Test: `frontend/web-app/src/features/materials/model/materialDocument.test.ts`

- [ ] Add failing tests proving fillGaps item limits survive serde and live score ignores configurable penalties.
- [ ] Add `maxAttempts`, `hintCount`, and `maxErrors` to fillGaps item model.
- [ ] Make `materialAssessmentForItem` prefer item limits for fillGaps.
- [ ] Replace configurable `attemptPenalty`/`hintPenalty` score factor with fixed simple factor.

### Task 2: FillGaps Renderer

**Files:**
- Modify: `frontend/web-app/src/features/materials/ui/blocks/RenderedFillGapExercise.tsx`
- Test: `frontend/web-app/src/features/materials/ui/blocks/RenderedFillGapExercise.test.ts`

- [ ] Add failing tests for per-item hint limits.
- [ ] Use item-level `hintCount` and `maxAttempts` for hint availability, locking, and attempt bars.
- [ ] Keep the compact inline indicator next to each gap.

### Task 3: Editor UI

**Files:**
- Modify: `frontend/web-app/src/features/materials/ui/MaterialBlockEditor.tsx`
- Modify: `frontend/web-app/src/shared/i18n/resources/{ru,en,de,fr}.ts`

- [ ] Remove block-level fillGaps penalty controls from the editor.
- [ ] Add compact per-phrase controls for attempts/hints/errors with localized labels.
- [ ] Keep `singleChoice` attempts derived from options and `wordBank` using item error limit.

### Task 4: Backend Scoring

**Files:**
- Modify: `backend/api-gateway/src/main/kotlin/com/playsay/gateway/service/LessonMaterialStore.kt`
- Test: `backend/api-gateway/src/test/kotlin/com/playsay/gateway/MaterialControllerTest.kt`

- [ ] Add failing backend test where two fillGaps items in one block have different limits and penalty fields do not change score.
- [ ] Read item-level fillGaps limits in `materialAssessmentPolicy`.
- [ ] Use simple fixed scoring factors for attempts/hints.

### Task 5: Contract And Verification

**Files:**
- Modify: `/Users/evgeniymednov/Documents/Projects/Play&Say/spec.md`

- [ ] Update the material contract to describe item-level fillGaps limits and simple 10-point score.
- [ ] Run frontend lint/test/build.
- [ ] Run backend tests.
- [ ] Capture a materials editor screenshot and include it in the report.
