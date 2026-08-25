# Worksheet material schema v2

Schema v2 keeps the existing `pages[]` document envelope and adds `layout: "WORKSHEET"`. A worksheet page contains exactly one `interactiveWorksheet` block with a permanent private `material-asset:<uuid>` raster, intrinsic pixel dimensions, accessible alt text, and ordered normalized interaction groups. Coordinates are integers in a `0..1000` page space; `x + width` and `y + height` may not exceed `1000`. Renderer image and overlays always share the same scale/zoom transform.

Supported groups are `FILL_GAPS` (`TYPED`, `SINGLE_CHOICE`, `WORD_BANK`, `FORM_TRANSFORM`), `MATCHING_PAIRS`, `MULTIPLE_CHOICE`, and non-scored `FLASHCARDS`. Gaps retain accepted alternatives and optional base form/options; pairs retain numbered text/image endpoints; choices retain ordered options and one or more correct option IDs; cards retain complete text/image front and back sides. Existing answer envelopes are reused as worksheet block answers: `items`, `matches`, and `choiceItems`. Flashcard reveal produces no objective score.

The stored teacher document contains validation/scoring keys. Learner UI must not derive labels, telemetry, or pre-evaluation state from accepted answers, correct option IDs, or flashcard backs. Original PDFs, answer-key pages, excluded rasters, source relationships, attribution and copyright metadata are separate teacher-only source attachments and are never ordinary learner assets.

Schema v1 remains readable and writable without migration. Unknown worksheet group types, invalid references, incomplete structures, duplicate IDs/orders, out-of-bounds geometry, or missing permanent source assets are rejected before persistence. A photo/PDF import always materializes as `PRIVATE`/`DRAFT`; publishing and assignment remain separate teacher actions.

The service-owned internal API is defined in `backend/contracts/worksheet-import-internal-contract/src/main/openapi/openapi.yaml`; the public gateway API is exported to `contracts/openapi.yaml`. Generated sources are regenerated with project tasks and are not hand-edited.
