# Backend duplication classification

This inventory classifies the cross-module duplication reported by
`scripts/ci/backend-architecture-report.sh` and the recurring semantic patterns
reviewed during the technical-debt refactor. It is a decision record, not a
license to merge code solely because it looks similar.

## Exact cross-module clones

| Clone | Classification | Decision |
| --- | --- | --- |
| `JacksonConfig.kt` in ai-tutor-service, api-gateway, and vocabulary-service | Spring configuration | The serialization policy is currently identical in three modules. It may move only to a narrow, test-covered Jackson configuration component; controller and domain configuration remain local. |
| `RawRequestBody.kt` in api-gateway and payment-service | Integration delivery infrastructure | Preserve exact UTF-8 request bytes for provider webhooks. A shared helper is allowed, but webhook endpoints, authentication, response mapping, and provider semantics remain local. |
| `OpenAiReasoningEffort.kt` in api-gateway and vocabulary-service | Framework-neutral deterministic utility | Consolidated in the focused `openai-support` module with behavioral tests. This is provider-option validation, not shared domain behavior. |

The machine-checked path-to-classification mapping remains in
`exact-clone-allowlist.tsv`. An entry must be removed when a clone is
consolidated and the clone verifier treats stale entries as failures.

## Semantic clone families

| Family | Classification | Shared seam | Must remain service-owned |
| --- | --- | --- | --- |
| Registration, payment, email, and media request/response mirrors | Wire contract | Service-owned OpenAPI documents and generated model modules | Domain entities, service commands, HTTP transport, authentication, and error translation |
| Keyboard→vocabulary, vocabulary→gateway, and gateway→vocabulary outboxes | Integration delivery infrastructure | Deterministic exponential backoff and small delivery-state primitives | Payloads, database entities/repositories, endpoint paths, scheduling, idempotency, and success/delete semantics |
| Gateway internal HTTP clients and registration→email client | Integration delivery infrastructure | Timeout construction, required service-token handling, request execution, observability hooks, and transport-failure representation | Contract models, endpoint paths, raw webhook forwarding, status-code mapping, and user-facing error translation |
| OAuth2 `SecurityConfig` variants | Spring/security configuration | No shared production seam yet: permitted paths and role conversion are not identical in at least three modules | Authorization rules, public/internal path policy, filters, and realm-role mapping |
| Provider controller and gateway facade controller pairs | Domain-local behavior | None | Provider ownership and public facade mapping are intentionally separate |
| Gateway and media `YoutubeVideoCacheService` classes | Domain-local behavior | Generated media wire contract only | Gateway job/persistence orchestration and media object-storage/download behavior |
| Repeated repository/entity declarations | Spring/JPA boilerplate | Gradle conventions and architecture checks only | Aggregates, queries, locking, indexes, and transaction semantics |

## Extraction rules

1. A shared component must have one stated responsibility and behavioral tests.
2. Domain policies remain local even when their control flow is similar.
3. Raw request bodies and service-specific status/error mapping stay visible at
   their boundary adapters.
4. No payload, repository, endpoint, or success-state policy may enter generic
   integration support.
5. The empty `shared-kotlin` project is not a destination for new code; focused
   modules must be named for their consumer contract.
