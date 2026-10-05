# HTML-game incident production diagnosis, 2026-10-05

Owner explicitly authorized sanitized interval diagnosis on 2026-10-05. The reported date remains provisional: the user confirmed only the last uploaded HTML game, not the date.

Live production was release/01.007.12 with all 19 ArgoCD applications Synced/Healthy. Web immutable image sha256:606732fa6e413db83698d715794bc2d19099170f1d99b1075dd10681ba6a5470; collaboration image sha256:af19c28c994d58f499f496ee461d28026a9a084d06a0d5b71b87322c49c933c7. This matches the source baseline used for the local reproduction.

The bounded read-only query for 2026-10-05 11:17–11:22 MSK (08:17–08:22 UTC) returned 219 unique events, no truncation. All six collector sources had 19 healthy input heartbeats, maximum gaps 15.910–17.450 seconds. Source event counts: RF nginx 2, AX41 nginx 62, RF coturn 0, LiveKit 9, API route 16, collaboration 16. Two signaling request pairs were present. No source was missing, unavailable or incomplete by the existing heartbeat coverage criterion.

These aggregates do not attribute a click, identify a game asset, or prove the immediate cause of the reported control failure. The exact last uploaded asset and authenticated two-participant reproduction remain pending. Established source regression: minimized presentation retained the iframe, and shared-state refresh could restore focus. Do not equate healthy log coverage with application correctness.

The original protected local route was unreachable and a loopback endpoint returned 403. The successful read used an authenticated SSH tunnel to AX41's declared protected VPN-interface address and retained verified TLS/operator credentials; no ingress/configuration was modified. No raw user data or event rows are preserved in this evidence.
