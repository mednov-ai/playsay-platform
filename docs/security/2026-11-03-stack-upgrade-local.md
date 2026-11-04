# Stack upgrade: local dependency evidence

This is preliminary evidence for the uncommitted hotfix based on platform
`8982e00324136303d8119c9e8037cb3a11afbcd0`. It is not a publication,
production, or deployed-environment security clearance. Fresh full scans for
the exact committed candidate and native CI artifacts remain mandatory.

## Node dependency boundaries

On 2026-11-03 the full frontend npm audit, including development dependencies,
reported zero critical, zero high, and 11 moderate affected package nodes.
The raw report is [retained](2026-11-03-stack-upgrade-frontend-audit.json);
SHA-256 `92f2266f9210e52c8e48a914138b399562e8a66014aef077bf19aa2c9fdf2cd2`.
The affected frontend lockfile SHA-256 is
`eb553dd499297bfdcbb2672f829ad42d24248f8a4c18180c96df2cc1ecc96753`.
The underlying advisory is
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)
on minimatch below 11.0.1; the remaining nodes are indirect ESLint and
TypeScript-ESLint findings. The report is not vulnerability clearance.

Every affected package node in that lockfile is marked `dev: true`.
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

### JVM build-only boundary

The preliminary full scan detected CVE-2026-53914 in Gradle 9.5.1's Kotlin
2.3.20 build tooling and a CVE-2022-31691 scanner match on
`spring-boot-loader-tools:4.1.2`. The latter is a Spring Tools product
misidentification, but is retained as a finding. None of those 24 exact
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
runtime, with multiple high-severity CVE matches. The Maven runtime BOM and
Gradle server inventory were aligned to 4.5.35, the
[upstream security maintenance release](https://vertx.io/blog/eclipse-vert-x-4-5-35/).
The Maven package completed locally with 12 Vert.x 4.5.35 JARs and 18 Netty
4.1.139 components verified from packaged metadata. See the
[Vert.x inventory](2026-11-03-keycloak-vertx-inventory.tsv). The selected
fresh Keycloak dependency scan reports no blocking runtime findings, with five
previously classified outside-runtime findings retained. The overall scan
still failed on the build-logic findings described above. A native container
build, authentication and deployed DEV acceptance are not established by
the local Maven package.
