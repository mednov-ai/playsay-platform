# Classroom collaboration recovery validation (2026-10-06)

The numeric build-only candidate is release/01.007.15 at e50e5d4c82765342f2ba51e05fd9490378f0b21b, based on the live production platform d7090c2b731e970869f865ae07ae264b0af5ebe0 / infra 8de933f7818685d1b5e21c1a59b1b8da8f4b1739 (release/01.007.14). Production promotion is pending separate authority.

## Tests and security

The isolated production-baseline patch passes 65 collaboration tests, 823 frontend tests, lint/type/build and eight collector privacy tests. Integration into the newer develop passes 75 collaboration tests and 848 frontend tests. The compatible sharp 0.35.5 update passes all 37 game-adapter tests including external Chromium and a native SVG-to-PNG conversion with librsvg 2.63.2. Fresh full audits retain only the exact accepted braces advisory; no new finding is accepted.

Four local Chromium/WebKit desktop/mobile synthetic-API tests establish interrupted-send recovery, immutable snapshot acknowledgment, process restart after acknowledgment, explicit missing-document status and light/dark layout. These local tests do not establish production/media acceptance.

## Actual DEV backend acceptance

A temporary isolated browser fixture uses the actual useYjsWorkspace hook with real demo teacher/student authorization, real DEV API documents, real collaboration WebSocket and real snapshot storage. Only its local presentation/token delivery bridge is synthetic; tokens and snapshot results are obtained from the actual authorized API. No signing secret is copied and no production data is used.

Capability-disabled direct/RF propagation and acknowledged browser restore pass with p95 151.8/167.3 ms. With capability enabled, deliberately dropping the active browser sender then foreground/online wake restores convergence in 6472/6629 ms through direct/RF origins. Normal p95 is 157.1/175.1 ms, every measured propagation stays below one second, and the API snapshot decodes to the newest text before fresh-browser restore. Fixture-created lessons are deleted and temporary materials archived after acceptance. Local queue budget/concurrency tests provide resource-bound evidence; this is not a remote heap profile or physical-device/media acceptance.

## Develop source-to-result mapping

The isolated hotfix b0b2921ce2942a9009ab43f3c8c5877b87c1784e maps to develop cherry-pick 8f422a31. The compatible sharp fix e50e5d4c maps to 70a91045. Conflicts preserve existing develop React dependencies and its current agent guide; lock resolution updates only the targeted sharp chain while preserving newer develop dependencies. The recovery code merges into the existing develop authorization implementation rather than replacing it with older release content. Local validation runs on that merged source.

Merge 780885ce adds release/01.007.15 ancestry using the ours strategy after these semantic cherry-picks; its tree equals its first parent. Thus the release history is included without reverting newer develop application functionality. Production desired state and the current-release pointer stay at release/01.007.14 until separately approved promotion.
