# Future: expected material guard for legacy lesson annotations

Deferred explicitly by the owner on 2026-10-09; excluded from the Text collaboration hotfix and its release.

The lesson-only REST save resolves the currently assigned material on the server. A request already sent for material A can race with reassignment to material B. Frontend queue disposal cannot recall an issued request.

A future API change should accept the expected material ID, lock the lesson before resolving assignment, reject a mismatch without writing, and retain backward compatibility deliberately. Update the OpenAPI contract/generated clients and test an in-flight A save racing with B assignment, authorization and legacy callers. No database migration is currently proposed. Remove this backlog entry once the separate change is accepted.
