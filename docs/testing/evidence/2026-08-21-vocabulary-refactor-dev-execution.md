# Vocabulary refactor dev execution — 2026-08-21

## Result

**FAIL — release-blocking acceptance regressions found.** The broad student, teacher, classroom, homework, localization, responsive-layout, and accessibility smokes passed. The targeted real-user vocabulary run found four reproducible failures and recorded them in OpenSpec change `fix-vocabulary-acceptance-regressions` for a separate implementation turn.

Environment: `https://dev.online.honey.school` and `https://dev.key.honey.school`. GitOps revision `123c8c46b2c84487d9fd3d7803cfa909a7574a50`; all 19 ArgoCD applications were `Synced/Healthy`. The `api-gateway`, `web-app`, `keyboard-app`, and `vocabulary-service` pods were ready, running, and had zero restarts when evidence was collected.

No production or legacy environment was accessed. Demo credentials were retrieved from the current dev Kubernetes secret through the documented AX41 path, held in process memory, and never printed or written to evidence.

## Automated and browser checks

| Check | Result | Coverage/evidence |
|---|---:|---|
| `vocabulary-student-ui-smoke.mjs` | PASS, 8/8 | `ru/en/de/fr` × desktop/mobile; composer, player, Key modes, media states, reduced motion, containment |
| `vocabulary-teacher-ui-smoke.mjs` | PASS, 8/8 | `ru/en/de/fr` × desktop/mobile; multi-learner preview, policy, report, accessibility |
| `sprint5-ui-smoke.mjs` | PASS, 17/17 | Real teacher and two-student Keycloak sessions; lesson/collaboration/annotation/reconnect/submission and cleanup; run `sprint5-ui-20260821063341` |
| `sprint6-homework-smoke.mjs` | PASS, 16/16 | Real teacher and two-student sessions; group/single homework, privacy, draft/autosave, grading/reporting/resubmit and cleanup; run `sprint6-homework-20260821063431` |
| Targeted real vocabulary acceptance | PARTIAL / FAIL | Three real roles, deterministic explicit selection, plan publication, Key stream/auth/snapshot, media lifecycle/privacy, mobile UI and cleanup |

The targeted run passed real Keycloak login for `teacher-demo`, `student-demo`, and `student-demo-2`; entry deduplication with occurrence provenance; hyphenated-word preservation; dashboard retrieval; deterministic explicit preview with reasons; direct mixed whole-word/n-gram materialization with configured 2–5 character bounds; foreign-session denial; immutable Key targets after entry edits; first-use asynchronous media generation; reviewer approval and queue access; opaque authorized media delivery and foreign denial; personal hide/restore; regeneration without replacing the approved asset; reviewer rejection; English locale; reduced motion; and 390×844 viewport containment.

The publication and later checks used an explicit-settings diagnostic workaround only after the first failure proved that reference-only publication defaulted the settings. The workaround is not a product pass.

## Confirmed failures

### VA-001 — Frozen preview settings are lost on publication

- Preview: explicit entries, `mode=KEYBOARD`, `keyMode=MIXED`, n-gram bounds 2–5.
- Normal web publication shape: `planId` plus `planRevision` only.
- Actual: published Key set defaults away from `MIXED`; the frontend cannot reproduce the approved preview without resending hidden settings.
- Root-cause evidence: the composer intentionally sends only the plan reference, while practice persistence/materialization reads Key and completion fields from the thin publication request instead of the resolved frozen plan.

### VA-002 — Approved media is not reusable across eligible learners

- Learner A created and a managing reviewer approved an image for the resolved English noun sense `capybara → капибара`.
- Learner B created the same normalized sense inside the same dev school contour.
- Expected: the same approved asset, no second first-use generation.
- Actual: a different learner-scoped sense and new candidate path. Lexical resolution always uses `LEARNER` with `learner:<subject>`, so school-wide reuse cannot occur.

### VA-003 — Honey School Key ignores a valid vocabulary launch

- Direct session Key-set API: authorized `200`, valid `MIXED` targets.
- Browser launch: `dev.key.honey.school/?vocabularySessionId=…` with the same authenticated learner.
- Network evidence: `200 /api/vocabulary/practice-sessions/{id}/key-set`.
- Actual UI: remained on the default “LETTER CHORDS” set and did not show vocabulary/MIXED context. This is consistent with an initialization/selection race, not an API or authentication failure.

### VA-004 — Mobile search icon overlaps placeholder

- Browser: Chromium, 390×844, English vocabulary list.
- Page and media card remained within viewport bounds.
- Actual: the leading search icon visually overlaps the first characters of “Find a word”, reducing legibility and touch/keyboard clarity.

## UI/UX assessment

The mobile information hierarchy is otherwise clear: Honey School branding, workspace switcher, vocabulary title, primary add action, date/history tabs, adaptive filters, card state, translation, and media are easy to scan. Controls have usable touch sizes and the page avoids horizontal overflow. The search overlap is conspicuous because it affects the primary retrieval control. Honey School Key's silent fallback is more severe: it gives the learner a polished but wrong activity with no indication that the assigned vocabulary session failed to activate.

## Cleanup and follow-up

All disposable practices were cancelled and all disposable personal entries were archived through supported APIs. Regeneration candidates were rejected; one stray capybara candidate created while proving cross-learner non-reuse was also rejected. One reviewed approved capybara asset remains intentionally as reusable non-personal test media. No raw screenshots, tokens, passwords, object keys, or learner payloads were committed.

The implementation-ready planning artifacts are at `/Users/evgeniymednov/openspec/changes/fix-vocabulary-acceptance-regressions/` and passed strict OpenSpec validation.

## Local remediation verification — 2026-08-21

The four failures above have a local implementation and automated regression coverage. This does **not** change the failed dev result: no delivery or real-role dev rerun was authorized in the remediation turn.

| Former failure | Local verification |
|---|---|
| VA-001 frozen publication | Backend reference-only integration preserves non-default mixed Key/n-gram and completion settings; stale and conflicting plan input is rejected and retries remain idempotent. |
| VA-002 shared media | Vocabulary integration covers shared school identity, separate personal entries, approved-asset reuse without another generation, and idempotent legacy promotion. |
| VA-003 Key launch | Playwright smoke covers whole-word, n-gram and mixed explicit-launch precedence, safe unavailable/foreign error, authorized return, and ordinary startup. |
| VA-004 mobile search | Component tests plus Playwright verify empty, typed and cleared geometry, focusability and no overflow for `ru/en/de/fr` at 390×844 and 1440×900. |

Real dev acceptance and GitOps health remain required after a separately authorized delivery.
