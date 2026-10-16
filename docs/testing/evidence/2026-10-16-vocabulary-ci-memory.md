# Vocabulary CI memory bound — 2026-10-16

Shared-library dispatcher258 selected vocabulary-service because the shared WebSocket contract changed. Native vocabulary73 passed fresh security but its 2 GiB Gradle container was OOMKilled (137) during tests; it did not publish. Keep this failed result.

Bound the existing container rather than increasing node requirements: Gradle heap384m/metaspace256m, one worker/in-process compiler, optional lowMemoryTests profile with one 384m test fork restarted every eight classes. The project helper enables this profile only for its CI test/package command. Dependencies and server runtime remain unchanged.

Local exact profile passes full vocabulary tests, Detekt and bootJar. Twelve dependency-security CI contract tests pass. Native retry and immutable image/rollout evidence are required before acceptance. This operational fix is part of authorized shared-library DEV delivery; production promotion is not included.
