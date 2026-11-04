# Scoped production Keycloak image risk acceptance

On 2026-11-04 the owner explicitly instructed accepting the retained candidate
PostgreSQL/Keycloak risks and updating production, then granted a one-time stage
acceptance exception with immediate post-rollout acceptance. Fresh complete
scans, backup/restore, schema convergence, actual activity and GitOps release
gates remain required. Exact image comparisons and the owner acceptance are
retained in infra `migrations/ax41/evidence/20261104-stack-upgrade-production-risk-acceptance.md`.

The existing Keycloak image exception was DEV-only. Its additional production
scope is exactly `release/01.007.25`, repository
`ghcr.io/mednov-ai/playsay-keycloak`, production publication flags and reviewed
Keycloak component tree `b5310ef435edb065599d7655003de0355efc0b45`. Only the
three pre-existing CVE/package/version rows remain accepted: CVE-2026-91403 in
java-21-openjdk-headless 1:21.0.13.0.9-1.2.el9, and CVE-2026-119373 plus
CVE-2026-119586 in sqlite-libs 3.34.1-11.el9_8. Changed trees, repositories,
versions, scan errors, other releases and new findings fail closed. This is
unresolved accepted risk for this candidate, not a remediation or a standing
exception. Original DEV scope is unchanged.

The scoped CI change leaves application and Keycloak component source trees
unchanged from candidate ac483353beb2abab8c1d076a887044b536d24c1f. It nevertheless
requires a new exact source SHA and numeric release finalization. Earlier
application images retain their actual original source provenance.
