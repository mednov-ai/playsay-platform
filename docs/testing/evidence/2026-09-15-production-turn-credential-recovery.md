# Production TURN credential recovery incident — 2026-09-15

## Scope

Read-only evidence for `hotfix-refresh-expired-livekit-turn-credentials`. The observation covers 2026-09-15 06:33:51–06:36:29 UTC / 09:33:51–09:36:29 Europe/Moscow. No production state was changed.

## Sanitized observations

- The established learner media path entered reconnect after the short-lived regional relay credentials had expired.
- LiveKit accepted four RTC resume attempts, but none completed RTC recovery with the mounted session configuration during the window.
- The regional coturn service rejected 66 authentication attempts. At rejection time the supplied credential expiries were 999–1156 seconds in the past.
- Signaling remained reachable while RTC media did not recover. The teacher-side session and production application pods remained available, with no relevant restart or rollout in the window.
- A full learner page reload requested a fresh authorized room token. The replacement connection became active in 289 milliseconds and media recovered.

## Classification

The initial transport interruption is not attributed to a specific provider or network component by this evidence. The confirmed application defect is the recovery path: the mounted frontend room reused expired server-authored TURN credentials across reconnect attempts and had no fresh-token replacement boundary.

## Privacy review

This note retains only bounded timestamps, counts, expiry age, coarse signaling/RTC outcome, service health, and recovery timing. It contains no participant identity, room or lesson identifier, token, TURN username or credential, address, ICE candidate, SDP, browser payload, or lesson content.
