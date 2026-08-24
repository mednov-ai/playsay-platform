# Honey School testing guides

- [Vocabulary and backend-refactor manual regression](vocabulary-refactor-manual-regression.md) — repeatable P0/P1/P2 checks for the current adaptive vocabulary module, Honey School Key integration, generated media, and behavior preserved by the backend refactoring.
- [Vocabulary refactor dev execution — 2026-08-21](evidence/2026-08-21-vocabulary-refactor-dev-execution.md) — sanitized real-role browser evidence, UX assessment, cleanup, and confirmed acceptance failures.
- [Data repository query coverage](datarepo-query-coverage.md) — automated query-coverage evidence and maintenance notes.

The manual guide is documentation, not a replacement for repository tests or Jenkins smoke stages. A live dev run is an explicit operation: use disposable demo data, follow the guide's evidence and cleanup rules, and never copy credentials or learner-private payloads into reports.
