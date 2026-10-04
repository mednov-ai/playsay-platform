# Lesson time and teacher extensions

Lesson access is timed by the API server. The initial access deadline is the scheduled end plus ten minutes; the opening window remains ten minutes before the scheduled start. At the exact effective cutoff the lesson is no longer available for new access.

The authorized managing teacher receives a compact offer two minutes before the effective cutoff. Accepting adds exactly ten minutes to that cutoff. Teachers can repeat this decision before each new cutoff; students cannot extend. Declining only dismisses this deadline's offer in the current browser session. Calendar duration, reminders and recurring sibling lessons do not change.

`POST /schedule/lessons/{lessonId}/extend-access` takes `expectedAccessRevision`. The server locks the lesson, rechecks current management rights and requires IN_PROGRESS status and `deadline - 120 seconds <= server time < deadline`. Exactly one request can extend a given revision; duplicate/concurrent/stale requests receive a conflict and clients reconcile the authorized lesson detail. Cancellation, completion and revocation still take precedence.

The additive migration stores extension seconds (default zero) and a monotonic access revision. Schedule snapshots return serverNow, accessEndsAt, accessRevision and accessAllowed; authenticated responses derive canExtend for their actor. Realtime policy messages leave canExtend null and never broadcast another actor's capability. Existing after-commit delivery and active schedule reconciliation propagate changes.

The frontend anchors server time to performance.now at receipt and never uses the device wall clock for lesson availability. On resume/reconnect it refreshes the anchor, and at expiry it reconciles the current server policy before closing. A five-second network bound and the last trusted anchor handle unavailable synchronization without inventing extra time. An offline participant cannot learn a new extension until connectivity recovers. Expiry need not overwrite the stored historical lesson status: accessAllowed and the deadline remain authoritative.

Implementation acceptance requires skewed device clocks, repeated extensions, concurrent requests, stale events, missed realtime delivery, reload/sleep, lost responses and authorized teacher/student rejoin. Real browser/DEV/production acceptance must be reported independently from local unit/integration results.
