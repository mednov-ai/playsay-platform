# Matching Pairs Card Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current matching-pairs line connector exercise with a two-column card flow where correct pairs move to a solved area in the order the student finds them.

**Architecture:** Keep the material JSON contract compatible: answers still store `matches` and `attempts` by left/pair id. Move interaction state into `RenderedMatchingPairsExercise.tsx`, keep deterministic right-column shuffle in `model/matchingPairs.ts`, and add small helpers for solved order and effective error limits. Styling stays in existing materials CSS and all new labels go through `shared/i18n` resources.

**Tech Stack:** React 18, TypeScript, Vitest/Testing Library, existing Play&Say material model, Spring backend assessment for persisted scoring.

---

### Task 1: Matching Pair Behavior Tests

**Files:**
- Modify: `frontend/web-app/src/features/materials/ui/blocks/RenderedMatchingPairsExercise.test.tsx`
- Modify: `frontend/web-app/src/features/materials/model/matchingPairs.test.ts`

- [ ] Write tests showing: correct click moves a pair into solved area in action order; wrong click records an attempt and leaves the pair unsolved; hover is neutral and does not reveal correctness; two-row effective error cap is 2.
- [ ] Run targeted tests and verify they fail before implementation.

### Task 2: Matching Model Helpers

**Files:**
- Modify: `frontend/web-app/src/features/materials/model/matchingPairs.ts`
- Modify: `frontend/web-app/src/features/materials/model/materialDocument.ts`

- [ ] Add `matchingEffectiveMaxErrors(configuredMaxErrors, rightOptionsCount)` returning `min(configured ?? 5, rightOptionsCount)` with a lower bound of 1 for non-empty exercises.
- [ ] Add small helpers only if needed for solved ordering; do not change persisted answer shape.

### Task 3: Renderer Rewrite

**Files:**
- Modify: `frontend/web-app/src/features/materials/ui/blocks/RenderedMatchingPairsExercise.tsx`

- [ ] Remove SVG connector rendering from the student/classroom interaction.
- [ ] Render unresolved left and right cards in two columns.
- [ ] Use neutral hover/focus styling only.
- [ ] On correct click, append the pair to solved order based on the current action; on wrong click, flash the clicked right card red and record an incorrect attempt.
- [ ] Render attempt/error bars next to left cards.

### Task 4: Editor, i18n, CSS

**Files:**
- Modify: `frontend/web-app/src/features/materials/ui/MatchingPairsEditor.tsx`
- Modify: `frontend/web-app/src/shared/i18n/resources/ru.ts`
- Modify: `frontend/web-app/src/shared/i18n/resources/en.ts`
- Modify: `frontend/web-app/src/shared/i18n/resources/de.ts`
- Modify: `frontend/web-app/src/shared/i18n/resources/fr.ts`
- Modify: `frontend/web-app/src/styles/materials.css`
- Modify: `frontend/web-app/src/styles/responsive.css`

- [ ] Add compact per-pair error setting if model fields already support item/pair assessment.
- [ ] Add all new labels/aria to ru/en/de/fr resources.
- [ ] Style cards, neutral hover, wrong flash, solved zone, and mobile stacking in Play&Say colors.

### Task 5: Contract And Verification

**Files:**
- Modify: `/Users/evgeniymednov/Documents/Projects/Play&Say/spec.md`

- [ ] Update matchingPairs contract: no free correctness on hover, correct pairs fall to solved zone in student action order, error bar limit formula.
- [ ] Run frontend lint/test/build and relevant backend tests if scoring changed.
- [ ] Run browser smoke with local Playwright and display screenshots in chat.
