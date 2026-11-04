# Stack hotfix merge-back evidence provenance

The merge-back retains the existing DEV security snapshots under their original
names. The three `2026-11-04-prod-candidate-*` files are byte-for-byte copies
of the corresponding files present in production-candidate source commit
`ac483353beb2abab8c1d076a887044b536d24c1f`; their different names avoid
overwriting the independently generated DEV snapshots.

These copies record source provenance only. Their dates and presence do not
prove that they describe a later image or that a release gate passed. Fresh
candidate-specific scans, exact runtime inventory and the release evidence
remain required for each delivered artifact.
