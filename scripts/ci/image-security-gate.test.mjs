import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const commit = 'a'.repeat(40);
const digest = `sha256:${'b'.repeat(64)}`;

function fixture(t) {
  const workspace = mkdtempSync(join(tmpdir(), 'playsay-image-gate-'));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const bin = join(workspace, 'bin');
  mkdirSync(bin);
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    WORKSPACE: workspace,
    IMAGE_REPOSITORY: 'ghcr.io/mednov-ai/scan-test',
    GIT_COMMIT: commit,
    BUILD_LABEL: 'test-42',
    DEPLOY_TO_DEV: 'true',
    DEPLOY_TO_PROD: 'false',
    KANIKO_CONTEXT: workspace,
    KANIKO_DOCKERFILE: join(workspace, 'Dockerfile'),
    LOG_FILE: join(workspace, 'calls.log'),
    EXPECTED_DIGEST: digest,
  };
  const build = join(workspace, '.image-build', 'scan-test', 'test-42');
  const report = join(workspace, 'image-security', 'scan-test', 'test-42');
  const writeExecutable = (name, content) => {
    const path = join(bin, name);
    writeFileSync(path, `#!/bin/sh\nset -eu\n${content}\n`, { mode: 0o755 });
    return path;
  };
  const run = (script, overrides = {}) => spawnSync('sh', [join(root, 'scripts/ci', script)], {
    env: { ...env, ...overrides }, encoding: 'utf8',
  });
  const calls = () => existsSync(env.LOG_FILE) ? readFileSync(env.LOG_FILE, 'utf8') : '';
  const prepareArchive = () => {
    mkdirSync(build, { recursive: true });
    writeFileSync(join(build, 'image.tar'), 'the image that was scanned');
  };
  const prepareEvidence = () => {
    prepareArchive();
    mkdirSync(report, { recursive: true });
    writeFileSync(join(report, 'full.json'), '{}');
    writeFileSync(join(report, 'blocking.json'), '{}');
    writeFileSync(join(build, 'scanned.sha256'), createHash('sha256').update('the image that was scanned').digest('hex'));
  };
  return { workspace, env, build, report, writeExecutable, run, calls, prepareArchive, prepareEvidence };
}

function installScanner(f) {
  f.writeExecutable('trivy', `
printf '%s\\n' "$1" >> "$LOG_FILE"
if [ "$1" = '--version' ]; then echo 'Version: 0.76.1'; exit 0; fi
mode="$1"; shift
output=''; cache=''; input=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    --cache-dir) cache="$2"; shift 2 ;;
    --input) input="$2"; shift 2 ;;
    *) shift ;;
  esac
done
if [ "$mode" = image ]; then
  if [ "${'$'}{TRIVY_MODE:-}" = error ]; then exit 7; fi
  mkdir -p "$cache/db"
  printf '{}' > "$cache/db/metadata.json"
  cat > "$output" <<'JSON'
{
  "ArtifactType": "container_image",
  "Metadata": { "OS": { "Family": "alpine", "Name": "3.24" } },
  "Results": [{ "Class": "os-pkgs", "Packages": [] }]
}
JSON
  if [ "${'$'}{TRIVY_MODE:-}" = tamper ]; then printf 'changed' >> "$input"; fi
elif [ "$mode" = convert ]; then
  printf '{}' > "$output"
  if [ "${'$'}{TRIVY_MODE:-}" = blocked ]; then exit 1; fi
fi
`);
  f.writeExecutable('wget', 'printf "wget\\n" >> "$LOG_FILE"; exit 8');
}

function installPublisher(f) {
  return f.writeExecutable('crane', `
printf '%s\\n' "$*" >> "$LOG_FILE"
case "$1" in
  version) echo '0.22.1' ;;
  digest)
    if [ "${'$'}{2:-}" = '--tarball' ]; then echo "$EXPECTED_DIGEST"; else echo "${'$'}{REMOTE_DIGEST:-$EXPECTED_DIGEST}"; fi ;;
  push|tag) ;;
  *) exit 9 ;;
esac
`);
}

test('Kaniko creates an unpublished archive and rejects a missing result', (t) => {
  const f = fixture(t);
  const kaniko = f.writeExecutable('kaniko', `
printf '%s\\n' "$@" > "$LOG_FILE"
while [ "$#" -gt 0 ]; do
  if [ "$1" = '--tar-path' ]; then shift; printf image > "$1"; break; fi
  shift
done
`);
  const result = f.run('run-kaniko-image-build.sh', { KANIKO_EXECUTOR: kaniko });
  assert.equal(result.status, 0, result.stderr);
  assert.match(f.calls(), /--no-push\n/);
  assert.match(f.calls(), /--no-push-cache\n/);
  assert.ok(existsSync(join(f.build, 'image.tar')));
  assert.ok(!existsSync(join(f.workspace, 'image-digest.txt')));
  const empty = f.writeExecutable('empty-kaniko', 'exit 0');
  const failed = f.run('run-kaniko-image-build.sh', { KANIKO_EXECUTOR: empty });
  assert.notEqual(failed.status, 0);
});

for (const mode of ['blocked', 'error', 'tamper']) {
  test(`security gate stops before publication on ${mode}`, (t) => {
    const f = fixture(t);
    f.prepareArchive();
    installScanner(f);
    const result = f.run('scan-image.sh', { TRIVY_MODE: mode });
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(f.calls(), /wget|push|tag/);
    assert.ok(!existsSync(join(f.workspace, 'image-digest.txt')));
    assert.ok(!existsSync(join(f.build, 'scanned.sha256')));
    if (mode === 'blocked') assert.ok(existsSync(join(f.report, 'full.json')));
  });
}

test('scan-only mode succeeds without publishing and cannot target an environment', (t) => {
  const f = fixture(t);
  f.prepareArchive();
  installScanner(f);
  let result = f.run('scan-image.sh', { SECURITY_SCAN_ONLY: 'true', DEPLOY_TO_DEV: 'false' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Scan-only build passed/);
  assert.doesNotMatch(f.calls(), /wget|push|tag/);
  assert.ok(existsSync(join(f.build, 'scanned.sha256')));
  assert.ok(!existsSync(join(f.workspace, 'image-digest.txt')));
  result = f.run('scan-image.sh', { SECURITY_SCAN_ONLY: 'true' });
  assert.notEqual(result.status, 0);
});

test('publisher verifies the archive and registry digest before publishing deployment tags', (t) => {
  const f = fixture(t);
  f.prepareEvidence();
  const crane = installPublisher(f);
  const result = f.run('publish-scanned-image.sh', { CRANE_BIN: crane });
  assert.equal(result.status, 0, result.stderr);
  const calls = f.calls();
  assert.ok(calls.indexOf('push ') < calls.indexOf(`tag ghcr.io/mednov-ai/scan-test@${digest} test-42`));
  assert.match(calls, new RegExp(`tag ghcr.io/mednov-ai/scan-test@${digest} dev`));
  assert.equal(readFileSync(join(f.workspace, 'image-digest.txt'), 'utf8').trim(), digest);
});

test('publisher does not deploy a changed archive or a mismatched registry digest', (t) => {
  const f = fixture(t);
  f.prepareEvidence();
  const crane = installPublisher(f);
  writeFileSync(join(f.build, 'image.tar'), 'modified after scan');
  let result = f.run('publish-scanned-image.sh', { CRANE_BIN: crane });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(f.calls(), /push|tag/);
  f.prepareEvidence();
  result = f.run('publish-scanned-image.sh', { CRANE_BIN: crane, REMOTE_DIGEST: `sha256:${'c'.repeat(64)}` });
  assert.notEqual(result.status, 0);
  assert.match(f.calls(), /push /);
  assert.doesNotMatch(f.calls(), /tag /);
  assert.ok(!existsSync(join(f.workspace, 'image-digest.txt')));
});

test('production publication never updates the mutable dev tag', (t) => {
  const f = fixture(t);
  f.prepareEvidence();
  const crane = installPublisher(f);
  const result = f.run('publish-scanned-image.sh', { CRANE_BIN: crane, DEPLOY_TO_DEV: 'false', DEPLOY_TO_PROD: 'true' });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(f.calls(), / tag .* dev/);
  assert.ok(!f.calls().split('\n').some(line => line.endsWith(' dev')));
});

test('each module pipeline scans before publishing, tagging, or updating GitOps', () => {
  const pipelines = readdirSync(root).filter(name => name.startsWith('Jenkinsfile.') &&
    readFileSync(join(root, name), 'utf8').includes('run-kaniko-image-build.sh'));
  assert.equal(pipelines.length, 14);
  for (const name of pipelines) {
    const content = readFileSync(join(root, name), 'utf8');
    const build = content.indexOf("stage('Build image archive')");
    const scan = content.indexOf("stage('Scan image')");
    const publish = content.indexOf("stage('Publish image')");
    const tag = content.indexOf("stage('Tag source commit')");
    const update = content.indexOf("stage('Update environment image reference')");
    assert.ok(build >= 0 && build < scan && scan < publish && publish < tag && tag < update, name);
    const migrate = content.indexOf("stage('DB migrate')");
    if (migrate >= 0) {
      assert.ok(publish < migrate && migrate < update, name);
      assert.match(content.slice(migrate, update), /assert-current-branch-head\.sh[\s\S]*run-dev-liquibase-job\.sh/, name);
    }
    assert.match(content, /IMAGE_REPOSITORY="ghcr\.io\/\$\{GITHUB_OWNER\}\/\$\{[A-Z_]+\}" \.\/scripts\/ci\/scan-image\.sh/, name);
    assert.match(content, /env\.SECURITY_SCAN_ONLY = env\.CI_BRANCH\.startsWith\('security-check\/'\)/, name);
    assert.match(content.slice(scan, publish), /archiveArtifacts artifacts: 'image-security\/\*\*\/\*', allowEmptyArchive: false/, name);
    assert.match(content.slice(publish, tag), /env\.DEPLOY_IMAGE == 'true'[\s\S]*prepare-and-publish-image\.sh/, name);
  }
});

test('legacy aggregate builds scan each image before migrations and pin each scanned digest', () => {
  const content = readFileSync(join(root, 'Jenkinsfile'), 'utf8');
  const build = content.indexOf("stage('Build and scan images')");
  const migrate = content.indexOf("stage('DB migrate')");
  const update = content.indexOf("stage('Update dev image tags')");
  assert.ok(build >= 0 && build < migrate && migrate < update);
  const builds = content.slice(build, migrate);
  assert.equal((builds.match(/run-kaniko-image-build\.sh/g) ?? []).length, 7);
  assert.equal((builds.match(/scan-image\.sh/g) ?? []).length, 7);
  assert.equal((builds.match(/prepare-and-publish-image\.sh/g) ?? []).length, 7);
  assert.equal((builds.match(/archiveArtifacts artifacts: 'image-security\/\*\*\/\*', allowEmptyArchive: false/g) ?? []).length, 7);
  assert.doesNotMatch(builds, /\/kaniko\/executor/);
  assert.match(builds, /\n      stages \{/);
  assert.match(content.slice(migrate, update), /assert-current-branch-head\.sh[\s\S]*run-dev-liquibase-job\.sh/);
  assert.equal((content.slice(update).match(/\.image\.digest = strenv\(IMAGE_DIGEST\)/g) ?? []).length, 7);
});
