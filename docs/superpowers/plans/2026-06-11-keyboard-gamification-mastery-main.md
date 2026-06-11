# Play&Say Key Gamification + Mastery Main Plan

## Summary
- Keep `Мастерство` as the main exercise result; no score/grade/rank UI.
- Extend the shipped mastery MVP into visible gamification: three-lesson calibration, league progress, streaks, achievements, and result events.
- Keep advice deterministic by default; optional AI enrichment is configured by env and cached by result/history fingerprint.

## Implementation
- Backend: split mastery EMA into `MasteryService` and gamification state/events into `GamificationService`; keep `TrainingService` as orchestration around idempotent result save.
- DB/API: extend `keyboard_gamification_profiles` with calibration counters/total/completion timestamp; add `keyboard_technique_advice_cache`; expose `calibrationSessions`, `calibrationTarget`, and `leagueProgress` in `GamificationProfileResponse`.
- Frontend: add `GamificationPanel` and render it in the side panel and finished result overlay; localize all gamification strings in `ru/en/de/fr`.
- Docs: keep root `spec.md` and `keyboard.md` synchronized with the new calibration, gamification, and advice-cache contract.

## Verification
- Backend targeted and full tests: `JAVA_HOME=/opt/homebrew/opt/openjdk@21 gradle :keyboard-service:test`.
- Frontend: `npm --workspace keyboard-app run lint`, `npm --workspace keyboard-app run test`, `npm --workspace keyboard-app run build`.
- Browser smoke: desktop/mobile result overlay with mastery metrics and visible gamification, checking no score/rank copy and no text overlap.

## Assumptions
- Calibration completes after three saved `STANDARD` or `CALIBRATION` lessons.
- League upgrades are monotonic after calibration; a weak single lesson does not downgrade the profile.
- Pro prizes remain event/catalog extension points only.
