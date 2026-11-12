# Gateway runtime Perl security update

The full DEV preflight image report for gateway build 244 at source
`f4847561a91ae81726a9e80e5d437d12d962676a` identified CVE-2026-82560
in `perl-base` 5.40.1-7ubuntu0.3, with the compatible Ubuntu security fix
5.40.1-7ubuntu0.4. That build passed the automated high/critical gate but is
ineligible for delivery because its full report contains a fixable finding.

The gateway image upgrades this already-installed runtime package from the
configured signed Ubuntu repositories and asserts the fixed minimum version.
It keeps the pinned Temurin base, externally built application jar, existing
non-root launcher and removal of package indexes. This does not authorize host
package operations or add an application toolchain. A fresh exact-source CI
build, full image scan and normal DEV acceptance remain required.

On the pinned linux/amd64 parent, the package upgrade and minimum-version
checks completed locally and Java 25.0.5+8 still started. This package-layer
check is not an application or final-image security clearance.
