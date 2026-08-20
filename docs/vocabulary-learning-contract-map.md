# Vocabulary learning contract compatibility map

This document records the compatibility baseline for the adaptive vocabulary change. It complements the product contract and OpenAPI sources; it does not replace them.

## Baseline sources

| Boundary | Source of truth | Current compatibility identity |
|---|---|---|
| Public vocabulary HTTP | `contracts/vocabulary-openapi.yaml` | Existing `/api/vocabulary/**` paths, enum values, entry/session/item fields, and response shapes |
| Public assignment HTTP | `contracts/openapi.yaml` generated from api-gateway annotations | `contentKind=VOCABULARY_PRACTICE`, `activityRef`, vocabulary assignment creation/detail, and recipient activity fields |
| Vocabulary realtime | `contracts/websocket-messages.schema.json` | Existing subscribe acknowledgements and entry/practice event variants |
| Gateway → vocabulary | `VocabularyAssignmentPreparationRequest/Response` plus `/internal/vocabulary/assignments` | Service-token-authenticated preparation and learner session references |
| Vocabulary → gateway | `VocabularyAssignmentProgressUpdateRequest` plus `/internal/vocabulary/assignments/{id}/progress` | Idempotent `eventId`, session revision, state, completion ratio, accuracy, and difficult-word count |
| Vocabulary → Key | `GET /api/vocabulary/practice-sessions/{id}/key-set` and Key `practiceContext` | Full-word items with vocabulary session/item/entry identifiers |
| Key → vocabulary | `/internal/vocabulary/practice-sessions/{id}/key-results` and keyboard result outbox | One `clientResultId` with item/entry/error attempts |
| Vocabulary media | `contracts/vocabulary-openapi.yaml` plus vocabulary media tables/object prefix | Sense-scoped candidates, reviewer lifecycle, personal overrides, immutable refs and authorized private content routes; the YouTube media-service contract remains separate |

## Additive evolution rules

| Area | Additive change | Compatibility rule |
|---|---|---|
| Entry and memory | Add sense/content revision IDs, favorite/media override, memory reason, policy version, and evidence watermark | Keep all current entry and skill fields readable. New fields are optional until all generated clients are deployed. Existing entry UUIDs remain stable. |
| Selection and planning | Add recipe CRUD, richer preview filters/reasons, eligibility watermark, deterministic seed, budget, and plan policy revisions | Keep current preview/create/self paths and `planId`/`planRevision`. Current `wordLimit`, pin, and exclude settings map to an equivalent recipe. |
| Sessions and attempts | Add acknowledged position, correction/retry metadata, evaluator version, and immutable evidence identity | Keep current session/item/attempt fields. Accept existing attempt requests; new clients send additional optional evidence fields. Existing materialized sessions stay on their pinned legacy policy. |
| Homework | Add frozen completion policy, thresholds, meaningful activity, review state, and detailed progress evidence | Existing assignments default to legacy complete-session semantics. New fields are nullable/additive in gateway responses and optional/defaulted in internal requests during rolling upgrade. |
| Realtime | Add new persisted progress/control event variants and optional policy/progress fields | Do not alter existing event meanings. Add schema variants explicitly; consumers must ignore unknown event types and reload persisted state after reconnect. |
| Honey School Key | Add typed targets and `WHOLE_WORDS`, `CHARACTER_NGRAMS`, `MIXED` modes with source attribution | Extend the existing `practiceContext`; current full-word payloads map to `WHOLE_WORDS`. Accept legacy result payloads while new result fields remain optional during rollout. N-gram results never imply full-word recall. |
| Media | Add vocabulary-specific sense, generation, review, and authorized delivery paths | Do not overload or change the existing YouTube contract. Media references are opaque; raw storage keys and credentials never enter public responses. |

## Rolling-upgrade order

1. Apply additive database migrations and deploy consumers that tolerate the new optional fields.
2. Publish generated public/internal client artifacts without enabling new producer behavior.
3. Enable new vocabulary producers by feature control: adaptive policy, composer, delivery policies, Key target types, then media.
4. Keep legacy sessions and assignments readable and completable until their immutable snapshots expire naturally.
5. Roll back by disabling new launches; never delete accepted evidence or rematerialize active snapshots.

## Runtime controls and diagnostics

The backend controls are `PLAYSAY_VOCABULARY_COMPOSER_ENABLED`, `PLAYSAY_VOCABULARY_ADAPTIVE_POLICY_ENABLED`, `PLAYSAY_VOCABULARY_DELIVERY_POLICIES_ENABLED`, `PLAYSAY_VOCABULARY_KEY_NGRAMS_ENABLED`, `PLAYSAY_VOCABULARY_GENERATED_MEDIA_ENABLED`, and `PLAYSAY_VOCABULARY_LEXICAL_BACKFILL_ENABLED`. Web/Key builds have matching `VITE_*` controls. Generated media additionally selects the generator and isolated storage provider/prefix; disabling it never removes approved metadata or snapshot references. Persistent S3 storage uses a dedicated `playsay-vocabulary-media` bucket. Automatic bucket creation is an explicit environment control intended for dev bootstrap and remains disabled by default for reviewed production provisioning.

Service-token-protected diagnostics are `GET /internal/vocabulary/diagnostics`, `POST /internal/vocabulary/reconcile`, `GET /internal/keyboard/vocabulary/diagnostics`, and `POST /internal/keyboard/vocabulary/reconcile`. They expose only bounded counts and ages for stale projections, assignment/Key callbacks, stuck generation and missing media objects. They never return entry/session subjects, answers, examples, prompts, object keys, callback payloads or credentials.

## Known overlap to preserve

At the start of implementation, `contracts/openapi.yaml`, generated web-app API types, classroom realtime code, and all four web-app locale resources already contain unrelated user changes. Contract generation and localization edits must be diffed narrowly and must not replace those changes. The vocabulary OpenAPI and vocabulary-service sources were clean at baseline; they are the first safe contract surface for additive work.
