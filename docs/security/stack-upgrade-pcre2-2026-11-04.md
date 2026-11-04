# Compatible application JVM runtime package fix

Full image triage found eight Medium CVEs in Ubuntu libpcre2-8-0
10.46-1build1 with compatible security package10.46-1ubuntu0.1. They are not
covered by the PostgreSQL/Keycloak risk acceptance and are not claimed absent
from runtime. Nine application JVM Dockerfiles update only that already-installed
package through the signed Ubuntu repositories, assert the fixed minimum version
and remove package indexes. The reviewed Temurin25.0.5+8 multiarch index is pinned;
jar compilation and tests remain in Jenkins, and the non-root Java launcher is
preserved. No application Kotlin/TypeScript, Gradle dependency graph or changelog
is changed by this image-layer fix.

Both arm64 and the exact linux/amd64 parent passed the package-version assertion
and Java25.0.5+8 startup afterward. Native exact-source tests and final-image full
scans remain required; local package verification is not a clearance for later
images. Before promotion verify these CVEs are absent from every resulting JVM
runtime report: CVE-2026-103111, CVE-2026-86145, CVE-2026-89156,
CVE-2026-89157, CVE-2026-89158, CVE-2026-89160, CVE-2026-89161,
CVE-2026-89162. Retain full reports including lower severities. Existing unexpired
and exact-scoped findings in other components remain separately documented.

The infra runbook contains the scoped replacement of the old blanket prohibition
on apt-get in runtime Dockerfiles. It permits this security package update while
keeping external jar builds, image scanning and immutable publication intact.
