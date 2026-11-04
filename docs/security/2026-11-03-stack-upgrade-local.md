# Stack upgrade: local dependency evidence

This is preliminary evidence for the uncommitted hotfix, which incorporates
platform `e37bb8aa3107c71dd31edfaea8c3735b2025532d` along with the original
hotfix base `8982e00324136303d8119c9e8037cb3a11afbcd0`. It is not a publication,
production, or deployed-environment security clearance. Fresh full scans for
the exact committed candidate and native CI artifacts remain mandatory.

## Node dependency boundaries

On 2026-11-03 the full frontend npm audit, including development dependencies,
reported zero critical, zero high, and 11 moderate affected package nodes.
The raw report is [retained](2026-11-03-stack-upgrade-frontend-audit.json);
SHA-256 `20abb158fe52ad090fbb2efd2a0003876dca2488add11bc41b870344fcc28f7b`.
The affected frontend lockfile SHA-256 is
`903e58c6611d7d859dbae6422b68f2a3276498081d915c426676c31b02c704e0`.
The underlying advisory is
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)
on minimatch below 11.0.1; the remaining nodes are indirect ESLint and
TypeScript-ESLint findings. The report is not vulnerability clearance.

Every affected package node in that lockfile is marked `dev: true`.
`npm audit --omit=dev` reported no vulnerabilities; its
[raw report](2026-11-03-stack-upgrade-frontend-production-audit.json) has
SHA-256 `bbf80808f25c7c930be98f39026c4b0dd04ef2709084622ddafe9a8c1dc7dc76`.
`npm ls --omit=dev` for all 11 listed nodes returned an empty tree, and
searching the built web, keyboard and game-adapter JavaScript for the package
names found no matches. The web and keyboard runtime Dockerfiles copy only
their built static distributions into nginx. The game-adapter runtime copies
its build output, game SDK, Playwright, Sharp and the explicitly listed native
dependencies, rather than the whole development `node_modules` tree. Thus
these findings are classified **outside-server-runtime** under the existing
owner policy, subject to rechecking the final lockfile and image contents.
This classification does not assert the findings are fixed or authorize
unknown/runtime findings.

The separate full collaboration-service npm audit reported zero findings;
[raw report](2026-11-03-stack-upgrade-collaboration-audit.json), SHA-256
`f83ef67f15f178bd03e84d879d06bda98e4ceb2df372e18b8bc6004b44f6797f`.
Its lockfile SHA-256 is
`0fd1b5604f8845158cb1f9597fb3e9650b70e22bcf3759a38644eefcda49fe05`.

## Frontend runtime images

The previous nginx 1.27 Alpine base was end-of-support and its preliminary
container scan reported High/Critical findings. Both frontend Dockerfiles now
use pinned nginx 1.30.6 on supported Alpine and install available Alpine
security updates. Isolated local builds of both final frontend images scanned
with zero High/Critical/Unknown matches. Their startup, health checks, SPA
fallbacks, API routes, WebSocket forwarding headers and web module-worker
MIME/404 behavior passed against a local mock upstream. The complete raw
reports and precise digests are retained in infra's
`migrations/ax41/evidence/security/20261103-stack-upgrade/`.
These are local builds; the package upgrade can resolve differently later, so
fresh full scans and review of the exact CI-built image digests remain
mandatory before delivery.

The Node 26 Alpine base scan also found six High matches under npm's bundled
dependencies. Both the collaboration and game-adapter runtime stages remove
the unused npm installation; their local full-image scans returned zero
High/Critical/Unknown matches. The collaboration service started as non-root
and passed its health check. The game adapter now uses the pinned Alpine base
instead of its vulnerable Debian base. Its non-root API, token checks and
image optimization passed at 1 CPU/1 GiB; a synthetic offline game passed the
real Chromium validator, and all 37 adapter tests passed on this image family,
including the previously skipped Chromium tests. Current Alpine packages are
resolved during the build; exact CI-built images and their dependency reports
still need fresh complete scans before publication.

## JVM analysis

The current Detekt alpha.1 compiler cannot read Kotlin 2.4 metadata. On the
upgraded candidate it reported thousands of type-resolution errors despite a
zero Gradle exit, so that run is **not** a valid static-analysis pass. A trial
of Detekt alpha.6 on the unchanged baseline source reproduced existing lint
findings under new baseline identifiers. All 107 resulting IDs correspond to
the same rule and source file in the previous 121-ID typed baseline; the
unchanged-source generation introduced no previously unlisted rule/file pair.
All nine upgraded services subsequently passed typed alpha.6 analysis with no
compiler-resolution errors. A complete fresh JVM dependency scan and
candidate-specific review remain necessary after the final committed changes.

The merged but still uncommitted source was scanned in full on 2026-11-03.
The gate reported `passed-with-accepted-risks`: build logic had five
accepted matches and 24 outside-runtime matches, while backend modules had
107 accepted matches and 68 outside-runtime matches, with zero blocking
matches. Match counts include repeated project references and are not
counts of distinct CVEs. The retained raw run is
`backend/build/reports/dependency-security/run.EHjiDcyA`; its recorded
revision is the pre-merge HEAD, so it is preliminary and does not attest
to the eventual committed source. The approved Kotlin exception expires
2026-11-14. Exact-source CI must rerun and archive the complete reports.

The first native Jenkins trial exposed a fresh-checkout gap: internal project
runtime JARs had not been built before the pre-scan inventory, so their hashes
were missing and all 24 build-logic outside-runtime classifications correctly
failed closed. The inventory now depends on the runtime configurations'
producer tasks. A fresh full 18-module checkout produced complete hashed
runtime graphs, and a separate clean multi-project regression fixture confirmed
that its internal runtime JAR is built and hashed. Fresh native CI and scans of
the resulting committed source remain required; the failed trial is not a
release clearance.

### JVM build-only boundary

The preliminary full scan detected CVE-2026-53914 in Gradle 9.5.1's Kotlin
2.3.20 build tooling, Detekt's Kotlin 2.4.10 analysis tooling, and a CVE-2022-31691 scanner match on
`spring-boot-loader-tools:4.1.2`. The latter is a Spring Tools product
misidentification, but is retained as a finding. None of those 31 exact
artifact hashes is present in the selected application server runtime graphs
or in the separately assembled Keycloak server. These are build-only
findings under the owner's 2026-10-14 outside-server-runtime policy, not
renewed or expanded CVE exceptions.

[Resolved runtime graphs](2026-11-03-stack-upgrade-runtime-graph.json) cover
all nine application services and Keycloak's `serverRuntime`. The nine
compiled application Boot JARs contained 1,117 nested dependencies in
aggregate and no matching build-only hash. The local Keycloak Maven build
produced 354 server JARs; its
[packaged inventory](2026-11-03-keycloak-runtime-inventory.tsv) has no matching
hash. Keycloak's Docker build copies the provider and rebuilt server library
tree into the pinned optimized image; the application Dockerfiles copy only
their prebuilt Boot JARs into Java runtime images. The release gates must
regenerate coverage for the selected candidate, reject missing runtime
inventories and verify actual packaged JARs before publication.

### Keycloak Vert.x

The preliminary complete scan found Vert.x 4.5.34 in the Keycloak server
runtime, with multiple high-severity CVE matches. The twelve specific Maven
and Gradle server runtime coordinates from the independently merged Keycloak
fix were aligned to 4.5.35, the
[upstream security maintenance release](https://vertx.io/blog/eclipse-vert-x-4-5-35/).
The Maven package completed locally with 12 Vert.x 4.5.35 JARs and 18 Netty
4.1.139 components verified from packaged metadata. See the
[Vert.x inventory](2026-11-03-keycloak-vertx-inventory.tsv). The selected
fresh Keycloak dependency scan before the merge reported no blocking runtime
findings, with five previously classified outside-runtime findings retained.
The later full scan against merged, uncommitted source also passed under the
recorded scoped policy. A native container build, authentication and deployed
DEV acceptance are not established by the local Maven package.

### Vite browser target and worker assets, 2026-11-04

The original source used Vite 6.4.3 and its [default module target](https://v6.vite.dev/config/build-options#build-target). Vite 7 and
[8](https://vite.dev/guide/migration#default-browser-target-change) raise the default browser versions; the web app, keyboard app and game-sync
library now explicitly retain Vite 6's `es2020`, Edge 88, Firefox 78, Chrome
87 and Safari 14 compilation targets. This preserves the compiler target,
not a guarantee that all browser APIs or devices at those versions work.
The configs use Vite 8's Rolldown options and the React plugin 6.2.1.

All three production builds passed locally. The game-sync tests passed 12/12
and the web push/service-worker tests passed 9/9. Against local preview
servers, current Chromium and WebKit rendered the web registration screen at
desktop and mobile sizes and the keyboard screen at desktop size. The web
service worker registered and activated; its JavaScript, the PDF module
worker and a PDF WASM asset were served successfully. External requests were
blocked and API responses were synthetic. These checks do not prove old
browser or physical-device support, the nginx deployment, authentication or
the upgraded DEV lesson. Exact rebuilt CI images still need fresh scans.
