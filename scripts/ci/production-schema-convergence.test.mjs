import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = dirname(fileURLToPath(import.meta.url));
const launcher = readFileSync(resolve(testDir, "run-production-liquibase-job.sh"), "utf8");
const checker = readFileSync(resolve(testDir, "check-production-schema-convergence.sh"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(testDir, "production-database-workloads.json"), "utf8"));

test("production migration launcher is operator-only and fixed to the production boundary", () => {
  assert.match(launcher, /namespace="playsay-prod"/);
  assert.match(launcher, /release\/\[0-9\]\[0-9\]\.\[0-9\]\[0-9\]\[0-9\]\.\[0-9\]\[0-9\]/);
  assert.match(launcher, /PLAYSAY_PRODUCTION_MIGRATION_CONFIRM/);
  assert.match(launcher, /APPLY:\$release_ref:\$module_name/);
  assert.match(launcher, /Module, changelog directory, and database Secret are not an approved production workload/);
  assert.match(launcher, /vocabulary-service:backend\/vocabulary-service\/src\/main\/resources\/db\/changelog:playsay-app-db/);
  assert.doesNotMatch(launcher, /playsay-dev|dev-kubeconfig|jenkins/);
});

test("production launcher requires the exact clean release changelog even when Git history is unchanged", () => {
  assert.match(launcher, /Checkout HEAD does not match \$release_ref/);
  assert.match(launcher, /git diff --quiet "\$release_ref" -- "\$changelog_dir"/);
  assert.match(launcher, /git status --porcelain --untracked-files=all -- "\$changelog_dir"/);
  assert.match(launcher, /Schema convergence blocked; pending changesets/);
});

test("production update compares an exact reviewed pending set and proves convergence", () => {
  assert.match(launcher, /liquibase \$common_args validate/);
  assert.match(launcher, /EXPECTED_PENDING_FILE/);
  assert.match(launcher, /diff -u \/tmp\/expected-pending\.txt \/tmp\/actual-pending\.txt/);
  assert.match(launcher, /Pending changesets differ from the reviewed inventory; update blocked/);
  assert.match(launcher, /Post-update schema status is converged: 0 pending changesets/);
  assert.match(launcher, /Schema convergence blocked; pending changesets/);
  assert.match(launcher, /exit 42/);
  assert.match(launcher, /exit 43/);
  assert.match(launcher, /exit 44/);
});

test("production launcher preserves changelog identity and never reads or prints Secret values", () => {
  assert.match(launcher, /cp -RL \/changelog-source\/backend \/changelog\//);
  assert.match(launcher, /--arg path "\$changelog_dir\/\$relative_path"/);
  assert.match(launcher, /secretKeyRef/);
  assert.doesNotMatch(launcher, /kubectl[^\n]*get secret|base64 -d|echo[^\n]*PLAYSAY_DB_PASSWORD/);
  assert.match(launcher, /automountServiceAccountToken: false/);
  assert.match(launcher, /backoffLimit: 0/);
  assert.match(launcher, /activeDeadlineSeconds: 600/);
  assert.match(launcher, /trap cleanup EXIT HUP INT TERM/);
  assert.match(launcher, /cleanup\nmkdir -p "\$manifest_dir"/);
  assert.match(launcher, /production schema \$migration_action failed or found drift/);
});

test("production workload manifest covers every enabled database-backed workload", () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.namespace, "playsay-prod");
  assert.deepEqual(
    manifest.workloads.map(({ module }) => module),
    [
      "api-gateway",
      "registration-service",
      "email-service",
      "ai-tutor-service",
      "vocabulary-service",
      "keyboard-service",
      "worksheet-import-service",
    ],
  );
  for (const workload of manifest.workloads) {
    assert.match(workload.changelogDir, /^backend\/[a-z0-9-]+\/src\/main\/resources\/db\/changelog$/);
    assert.match(workload.dbSecret, /^playsay-(?:app|keyboard|worksheet-import)-db$/);
  }
});

test("pre-promotion checker runs status for every declared workload", () => {
  assert.match(checker, /production-database-workloads\.json/);
  assert.match(checker, /\.workloads\[\]/);
  assert.match(checker, /"\$launcher" status "\$module_name" "\$changelog_dir" "\$db_secret" "\$release_ref" <\/dev\/null/);
  assert.match(checker, /done < "\$manifest_rows"/);
  assert.match(checker, /All declared production database workloads are schema-converged/);
});
