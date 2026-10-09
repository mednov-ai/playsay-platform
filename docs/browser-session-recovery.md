# Honey School browser session recovery

The online app supports coordinated credential renewal and bounded recovery on both production origins and their dev aliases. This is a frontend hotfix; Keycloak remains the identity provider, and backend permission, revocation and lesson admission remain authoritative.

## Behavior

- Concurrent REST/realtime callers share one renewal for the current credential generation. Late renewal, callback and API responses cannot overwrite or clear newer credentials or restore a logged-out account.
- Temporary auth/API failures retain credentials without sending an expired token as authority. Auth fetches have a 10-second deadline; renewal allows at most two attempts within a 25-second local budget and honors bounded Retry-After. User Retry starts an explicit new attempt. Business writes are never automatically replayed.
- Explicit sign-in reserves recovery synchronously before asynchronous PKCE or active-room teardown can start a competing silent attempt.
- Terminal token rejection allows one silent PKCE/OIDC recovery episode. Interaction-required, stale navigation markers, protocol errors or failed recovery expose explicit sign-in. Identity verification completes recovery; a successful token response alone does not reset the redirect budget.
- Safe internal navigation stays on the initiating origin. Callback credentials and shared lesson-link bearer fragments are excluded from stored return paths; the existing lesson-entry continuation remains responsible for admission.
- Verified identity is separate from module availability. Materials/schedule/people failures provide their own retry messages. Required profile/permission context gates dependent actions without deleting credentials on temporary failure.
- Foreground/pageshow and pre-admission work use the same renewal coordinator. An active classroom remains mounted during temporary failure. Navigation to recover terminal rejection requires a user action explaining the local interruption and never finishes the shared lesson.
- Visible and assistive recovery controls are localized in ru/en/de/fr. Local diagnostics retain at most 20 allowlisted outcome/count/timing records and reset on logout. They contain no credentials, identities, user content, return URLs or provider bodies.

The local deadline does not bound a browser stalled on an external identity-provider page. A silent recovery marker older than 60 seconds terminates automatic recovery when the app is revisited. Explicit logout and account replacement still clear old account state; ordinary refreshed credentials do not create a second identity provider or extend session lifetime.

## Implementation verification

The implementation is based on platform develop `af7e2e2128860ce7e790dab737b600a32a56ed8d`. The primary dirty workspace was preserved; an isolated checkout contains this patch. Regression tests first reproduced duplicate refresh, token deletion after HTTP 503 and undifferentiated terminal rejection.

Verification includes real app-controller state paths, stale API/callback completion, lost mutation response, refresh deadline/Retry-After, foreground overlap, active-room preservation and all four translations. External Playwright uses the local production build with synthetic API/OIDC responses for both origin policies at desktop 1366×900 and mobile 390×844. Synthetic OIDC continuation does not constitute live Keycloak/dev/production acceptance.

A fresh full npm audit discovered GHSA-6qxp-vccf-f47h in the transitive MCP SDK. The lockfile-only compatible update from 1.30.0 to 1.32.1 removes that finding. The owner explicitly accepted the remaining GHSA-vfj7-8cjw-p6xm build-tool risk for this hotfix, develop integration and its numeric production release through the unchanged 2026-12-05 10:46:15 UTC expiry. The exact chain and approval are recorded in docs/security/node-dependency-security-accepted-risks.json; this is unresolved accepted risk, not vulnerability clearance. Full reports remain operator artifacts outside commits.

No runtime rollout or numeric production release is established by these local checks. Delivery requires the infra runbook gates and separate authority. Integration evidence must identify source and published develop SHAs and verify semantic content and regressions before this hotfix is declared integrated.

Explicit active-classroom reauthentication captures the initiating internal path/query/ordinary fragment synchronously before local room departure or the PKCE crypto await. Local departure can navigate to the workspace, but the completed login restores the captured classroom path without completing the shared lesson. The paused-crypto controller regression covers this ordering.

Numeric release/01.007.16 is based on production .15 (e50e5d4c), with final sourceb3da7da314702765d04a5616233a29f6e696be09. It excludes unrelated document/vocabulary development and the MCP SDK commit because the production baseline has no installed MCP SDK. This integration preserves those develop features and patched SDK1.32.1. Release-head ancestry and operational production acceptance are recorded separately; ancestry alone does not establish promotion.

A pending PKCE flow is stored before asynchronous crypto and suppresses automatic silent recovery even when a late protected-request rejection reports a terminal phase. Pending flows and credential generations fence navigation after crypto, so cancellation or a newer flow cannot be overwritten. Production classroom acceptance exposed the late rejection; the paused-crypto controller regression now injects it explicitly.

Explicit login invalidates the preceding credential generation before reserving PKCE, so an older renewal cannot restore credentials or remove the new flow. Verified identity retires the pending flow together with the recovery marker. A held-renewal regression verifies the older result is rejected while the new flow remains intact.
