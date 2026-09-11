import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

const repo = resolve(import.meta.dirname, '../..');

function exercise(selector, fail = '', fileKey = false, revision = '0123456789abcdef0123456789abcdef01234567') {
  const dir = mkdtempSync(resolve(tmpdir(), 'honey-dependency-security-'));
  try {
    mkdirSync(resolve(dir, 'scripts/ci'), { recursive: true });
    mkdirSync(resolve(dir, 'backend/build-logic'), { recursive: true });
    mkdirSync(resolve(dir, 'bin'));
    copyFileSync(resolve(repo, 'scripts/ci/check-jvm-dependencies.sh'), resolve(dir, 'scripts/ci/check-jvm-dependencies.sh'));
    writeFileSync(resolve(dir, 'bin/git'), '#!/bin/sh\nprintf "%s\\n" "$FIXTURE_REVISION"\n', { mode: 0o755 });
    if (fileKey) writeFileSync(resolve(dir, '.env.nvd-api-key'), 'fixture-file-secret$(touch injected)\n', { mode: 0o600 });
    writeFileSync(resolve(dir, 'bin/gradle'), `#!/bin/sh
set -eu
[ "$NVD_API_KEY" = "$EXPECTED_KEY" ] || exit 12
printf '%s|%s|%s|%s\\n' "$DEPENDENCY_SECURITY_BUILD_ROOT" "$DEPENDENCY_SECURITY_MODULE" "$DEPENDENCY_SECURITY_DATA_DIR" "$*" >> "$CALL_LOG"
case "$*" in
  *dependencyCheckUpdate*) [ "$FAIL_MODE" != update ] || exit 9 ;;
  *dependencySecurityInventory*) [ "$FAIL_MODE" != inventory ] || exit 8 ;;
  *dependencySecurity*)
    [ -f "$DEPENDENCY_SECURITY_DATA_DIR/honey-update-success" ] || exit 7
    if [ "$FAIL_MODE" = accepted ]; then
      mkdir -p "$DEPENDENCY_SECURITY_REPORT_DIR"
      printf 'fixture accepted risk' > "$DEPENDENCY_SECURITY_REPORT_DIR/accepted-risks.txt"
    fi
    case "$DEPENDENCY_SECURITY_BUILD_ROOT:$FAIL_MODE" in
      */build-logic:tooling) exit 6 ;;
      */backend:backend) exit 5 ;;
    esac ;;
esac
`, { mode: 0o755 });
    const result = spawnSync('sh', [resolve(dir, 'scripts/ci/check-jvm-dependencies.sh'), selector], {
      encoding: 'utf8', env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}`,
        FIXTURE_REVISION: revision, GRADLE_BIN: resolve(dir, 'bin/gradle'), CALL_LOG: resolve(dir, 'calls'), FAIL_MODE: fail,
        NVD_API_KEY: fileKey ? '' : 'fixture-secret-never-in-arguments', NVD_API_KEY_FILE: '',
        EXPECTED_KEY: fileKey ? 'fixture-file-secret$(touch injected)' : 'fixture-secret-never-in-arguments', DEPENDENCY_SECURITY_CACHE_SEED: '' },
    });
    const reports = resolve(dir, 'backend/build/reports/dependency-security');
    return { result, calls: existsSync(resolve(dir, 'calls')) ? readFileSync(resolve(dir, 'calls'), 'utf8') : '',
      reportParentMode: statSync(reports).mode & 0o777,
      reportMode: statSync(resolve(reports, readdirSync(reports)[0], 'status.txt')).mode & 0o777,
      dataMode: statSync(resolve(dir, 'backend/build/dependency-security-data')).mode & 0o777,
      status: readFileSync(resolve(reports, readdirSync(reports)[0], 'status.txt'), 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('security gate refreshes data once and shares only the invocation-private database', () => {
  const { result, calls, status } = exercise('api-gateway');
  assert.equal(result.status, 0, result.stderr);
    assert.equal(calls.match(/dependencyCheckUpdate/g)?.length, 1);
    assert.equal(new Set(calls.trim().split('\n').map(line => line.split('|')[2])).size, 1);
    assert.match(calls, /\/backend\|api-gateway\|/);
    assert.match(calls, /-Dkev\.url=https:\/\/raw\.githubusercontent\.com\/cisagov\/kev-data\/refs\/heads\/develop\/known_exploited_vulnerabilities\.json/);
    assert.doesNotMatch(calls + result.stdout + result.stderr + status, /fixture-secret/);
    assert.match(status, /state=passed/);
    assert.match(status, /source_revision=0123456789abcdef0123456789abcdef01234567/);
});

test('advisory refresh failure prevents every analysis and cannot report a clean gate', () => {
  const { result, calls, status } = exercise('all', 'update');
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(calls, /dependencySecurity --continue/);
  assert.match(status, /state=failed-or-incomplete/);
  assert.doesNotMatch(status, /state=passed/);
});

for (const failure of ['tooling', 'backend', 'inventory']) {
  test(`${failure} failure propagates through the security entry point`, () => {
    const { result, status } = exercise('all', failure);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(status, /state=passed/);
    assert.match(status, /state=failed-or-incomplete/);
  });
}

test('inventory is explicitly separate from a successful vulnerability scan', () => {
  const { result, calls, status } = exercise('inventory');
  assert.equal(result.status, 0);
  assert.doesNotMatch(calls, /dependencyCheckUpdate|dependencySecurity --continue/);
  assert.match(status, /state=inventory-only/);
  assert.doesNotMatch(status, /state=passed/);
});

test('all JVM publication paths run the credential-bound gate before tests, migrations or images', () => {
  const files = ['Jenkinsfile', ...['api-gateway', 'ai-tutor-service', 'worksheet-import-service',
    'vocabulary-service', 'email-service', 'media-service', 'payment-service',
    'registration-service', 'keyboard-backend', 'keycloak'].map(name => `Jenkinsfile.${name}`)];
  for (const file of files) {
    const source = readFileSync(resolve(repo, file), 'utf8');
    const gate = source.indexOf("stage('Dependency security')");
    assert.ok(gate >= 0, file);
    assert.match(source, /activeDeadlineSeconds: 5400/);
    assert.match(source, /archiveArtifacts artifacts: 'backend\/build\/reports\/dependency-security\/\*\*\/\*', allowEmptyArchive: false/);
    assert.match(source.slice(0, gate), /timeout\(time: 75, unit: 'MINUTES'\)/);
    const publication = source.search(/stage\('Build and push image/);
    assert.ok(publication > gate, file);
    assert.match(source.slice(gate, publication), /check-jvm-dependencies\.sh/);
    assert.match(source.slice(gate, publication), /credentialsId: 'nvd-api-key'/);
    assert.match(source, /post\s*\{\s*always\s*\{\s*archiveArtifacts artifacts: 'backend\/build\/reports\/dependency-security\/\*\*\/\*'/);
  }
});

test('local key file is read as raw data and never evaluated or logged', () => {
  const { result, calls, status } = exercise('all', '', true);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(calls + result.stdout + result.stderr + status, /fixture-file-secret/);
});

test('accepted risks remain distinguishable from a clean scan in runner status', () => {
  const { result, status } = exercise('all', 'accepted');
  assert.equal(result.status, 0, result.stderr);
  assert.match(status, /state=passed-with-accepted-risks/);
  assert.doesNotMatch(status, /^state=passed$/m);
});

test('known exploited vulnerability analyzer uses an approved CISA mirror by default', () => {
  const runner = readFileSync(resolve(repo, 'scripts/ci/check-jvm-dependencies.sh'), 'utf8');
  const source = readFileSync(resolve(repo, 'backend/gradle/dependency-security.init.gradle'), 'utf8');
  assert.match(runner, /-Dkev\.url="\$DEPENDENCY_SECURITY_KEV_URL"/);
  assert.match(runner, /raw\.githubusercontent\.com\/cisagov\/kev-data\/refs\/heads\/develop\/known_exploited_vulnerabilities\.json/);
  assert.match(source, /dc\.analyzers\.kev\.url/);
  assert.match(source, /DEPENDENCY_SECURITY_KEV_URL/);
  assert.match(source, /raw\.githubusercontent\.com\/cisagov\/kev-data\/refs\/heads\/develop\/known_exploited_vulnerabilities\.json/);
  assert.doesNotMatch(source, /analyzers\.kev\.enabled\s*=\s*false/);
});

test('Jenkins can traverse and archive reports from a different container UID while data remains private', () => {
  for (const failure of ['', 'update', 'backend']) {
    const { reportParentMode, reportMode, dataMode } = exercise('all', failure);
    assert.equal(reportParentMode & 0o005, 0o005);
    assert.equal(reportMode & 0o004, 0o004);
    assert.equal(dataMode & 0o077, 0);
  }
});

test('missing or malformed source provenance fails before advisory update or analysis', () => {
  for (const revision of ['', 'not-a-commit', '01234567']) {
    const { result, calls, status } = exercise('all', '', false, revision);
    assert.notEqual(result.status, 0);
    assert.equal(calls, '');
    assert.match(status, /state=failed-or-incomplete/);
    assert.doesNotMatch(status, /state=passed/);
  }
});
