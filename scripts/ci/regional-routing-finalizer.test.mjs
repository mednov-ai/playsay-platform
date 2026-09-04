import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("release finalization gates actual API image, candidate and accepted develop routing before readiness", () => {
  const script = readFileSync(new URL("./finalize-release-candidate.sh", import.meta.url), "utf8");
  const guard = 'sh scripts/validate-regional-routing-release.sh';
  for (const ref of ["api_source", "GIT_COMMIT", "accepted_dev_commit"]) {
    const invocation = `${guard} "$PLATFORM_DIR" "$${ref}" "$base_infra_commit" "$routing_rollback"`;
    assert.ok(script.includes(invocation));
    assert.ok(script.indexOf(invocation) < script.indexOf("'.status = \"ready\""));
  }
  assert.ok(script.includes('Missing regional routing release guard'));
  assert.ok(script.includes('media-only-rollback) routing_rollback=--media-rollback'));
});
