import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const approved = [
  'os-pkgs|CVE-2026-91403|java-21-openjdk-headless|1:21.0.13.0.9-1.2.el9',
  'os-pkgs|CVE-2026-119373|sqlite-libs|3.34.1-11.el9_8',
  'os-pkgs|CVE-2026-119586|sqlite-libs|3.34.1-11.el9_8',
];

test('Keycloak acceptance fails closed outside the exact DEV scope and findings', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'playsay-keycloak-accept-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'trivy'), `#!/bin/sh
set -eu
[ "${'$'}{FAIL_CONVERSION:-false}" = false ] || exit 1
while [ "$#" -gt 0 ]; do
  if [ "$1" = --output ]; then cp "$TEMPLATE_RESULT" "$2"; exit 0; fi
  shift
done
exit 1
`, { mode: 0o755 });
  const input = join(dir, 'blocking.json');
  const rows = join(dir, 'rows');
  const out = join(dir, 'accepted');
  writeFileSync(input, '{}');
  const base = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    TEMPLATE_RESULT: rows,
    IMAGE_REPOSITORY: 'ghcr.io/mednov-ai/playsay-keycloak',
    CI_BRANCH: 'codex/hotfix-stack-upgrade-20261103',
    DEPLOY_TO_DEV: 'true',
    DEPLOY_TO_PROD: 'false',
    SECURITY_SCAN_ONLY: 'false',
  };
  const run = (lines, env = {}) => {
    writeFileSync(rows, lines.length ? lines.join('\n') + '\n' : '');
    return spawnSync('sh', [join(root, 'scripts/ci/accept-stack-upgrade-keycloak-findings.sh'), input, out],
      { env: { ...base, ...env }, encoding: 'utf8' }).status;
  };
  assert.equal(run(approved), 0);
  assert.equal(run([approved[0]]), 0);
  assert.notEqual(run([]), 0);
  assert.notEqual(run([...approved, 'os-pkgs|CVE-2099-1|sqlite-libs|3.34.1-11.el9_8']), 0);
  assert.notEqual(run([approved[1].replace('11.el9_8', '12.el9_8')]), 0);
  assert.notEqual(run([approved[1].replace('os-pkgs', 'lang-pkgs')]), 0);
  assert.notEqual(run(approved, { CI_BRANCH: 'develop' }), 0);
  assert.notEqual(run(approved, { IMAGE_REPOSITORY: 'ghcr.io/mednov-ai/other' }), 0);
  assert.notEqual(run(approved, { DEPLOY_TO_DEV: 'false', DEPLOY_TO_PROD: 'true' }), 0);
  assert.notEqual(run(approved, { SECURITY_SCAN_ONLY: 'true' }), 0);
  assert.notEqual(run(approved, { FAIL_CONVERSION: 'true' }), 0);
});

test('image-only Keycloak build cannot tag source or update or wait on DEV', () => {
  const pipeline = readFileSync(join(root, 'Jenkinsfile.keycloak'), 'utf8');
  assert.match(pipeline, /booleanParam\(name: 'IMAGE_ONLY', defaultValue: false/);
  assert.match(pipeline, /params\.IMAGE_ONLY && \(env\.DEPLOY_TO_DEV != 'true' \|\| env\.CI_BRANCH != 'codex\/hotfix-stack-upgrade-20261103'\)/);
  for (const stage of ['Tag source commit', 'Update environment image reference', 'Wait for rollout']) {
    const after = pipeline.split(`stage('${stage}')`)[1];
    assert.ok(after, stage);
    assert.match(after.split('steps {')[0], /env\.IMAGE_ONLY != 'true'/, stage);
  }
});
