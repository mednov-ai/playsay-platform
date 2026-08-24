# Public registration regression baseline

This worksheet is intentionally privacy-safe. It records no reporter email, display name, password, token, identity subject, provider payload, or message content.

## Confirmed baseline

- Reported stage: `CLIENT_VALIDATION_BLOCKED`.
- Evidence: the production registration form had populated inputs while “Create account” remained disabled; therefore that attempt could not reach `/api/registration/start`.
- Narrower password cause: unconfirmed. Masked glyph counts and photographed colors do not prove mismatch, email/name-fragment rejection, or another password rule.
- Current production release baseline at investigation start: platform `release/01.004.06`, commit `b53288c18f92dbd8e7033eebb61544ee902bc510`.
- Running production components are independently versioned: web app comes from release `01.004.06`; registration-service retains the accepted `01.004.05` image built from commit `711eea8d4740b9c0672cecd4be6b52f0e75ef597`.
- Both current production registration routes returned HTTP 200, which proves only page delivery, not registration start, email delivery, confirmation, role assignment, or sign-in.

## Synthetic reproduction matrix

| Case | Expected request count | Expected user-visible result |
|---|---:|---|
| Empty required fields | 0 | Email, password, and confirmation errors; email focused |
| Malformed email | 0 | Email format error; email focused |
| Password-policy failure | 0 | Exact unsatisfied policy rows plus password field error |
| Password mismatch | 0 | Confirmation mismatch error; confirmation focused |
| Valid form with repeated activation | 1 | One in-flight state and one visible outcome |

All cases use synthetic `example.test` identities and are covered by frontend tests. The shared policy fixture is consumed by both TypeScript and Kotlin tests so normalization and reason-code drift fails before delivery.

## Coarse diagnostic stages

- `CLIENT_VALIDATION_BLOCKED`: browser sends no start request.
- `REQUEST_ROUTING`: the same-origin gateway does not return a registration response.
- `REGISTRATION_SERVICE`: start request returns a safe 4xx/5xx classification.
- `KEYCLOAK_MUTATION`: service cannot create, refresh, or activate the synthetic identity.
- `EMAIL_DELIVERY`: the disposable confirmation mailbox receives no message before the bounded deadline.
- `CONFIRMATION`: the token endpoint does not confirm idempotently.
- `OIDC_SIGN_IN`: the confirmed synthetic credential cannot obtain a token containing `STUDENT`.

Existing HTTP status, gateway/service logs, Mailjet delivery state, Keycloak health, and request timestamps are sufficient for these stages when combined with the smoke run id. No additional personal/high-cardinality runtime telemetry is introduced by this hotfix.

## Acceptance and cleanup

`scripts/smoke/registration-e2e-smoke.mjs` creates a random disposable mailbox, drives the registration form with Playwright, confirms the received link twice to prove idempotency, verifies first OIDC password sign-in and the `STUDENT` role, removes the synthetic Keycloak identity through the registration-service-owned internal lifecycle, and deletes the mailbox. It prints only a run id, origin, coarse checks, and sanitized failures. Cleanup failure fails the smoke.
