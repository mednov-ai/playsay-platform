# Production lesson-entry confirmation incident — 2026-09-14

## Scope

Read-only evidence for the pre-room-token admission portion of `hotfix-refresh-expired-livekit-turn-credentials`. The observed shared-link start occurred at 2026-09-14 15:20:22 UTC / 18:20:22 Europe/Moscow. No production state was changed.

## Sanitized observations

- A valid shared lesson link was accepted while the scheduled lesson was in progress, and one browser attempt was created.
- The assigned managed learner account was enabled and its email-verification flag was true.
- No email challenge, Lobby request, identity confirmation, lesson assertion, or room-token acquisition followed the accepted-link event.
- Production retained no backend rejection for this attempt. The browser stopped at the generic identity-confirmation presentation before any confirmation action reached the backend.

## Classification

This was not a room-token, LiveKit, TURN, disabled-account, or unverified-email failure. The confirmed defect is the handoff between an accepted shared link and the required identity proof: the page did not clearly distinguish those states or make the next action sufficiently explicit for a first-time learner.

## Privacy review

This note retains only the UTC/MSK timestamp, admission stage, absence of downstream stages, coarse account state, and lesson state. It contains no participant identity, email, room or lesson identifier, link capability, browser-attempt secret, room token, address, authentication payload, or lesson content.
