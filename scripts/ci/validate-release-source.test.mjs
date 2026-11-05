import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const validator = fileURLToPath(new URL('./validate-release-source.sh', import.meta.url));

test('hotfix source is integrated in develop and based on current production without importing develop', () => {
  const repo = mkdtempSync(join(tmpdir(), 'release-source-test-'));
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = (file, contents) => {
    writeFileSync(join(repo, file), contents);
    git('add', file);
    git('commit', '-qm', contents);
    return git('rev-parse', 'HEAD');
  };
  const check = (kind, branch, source, base, proof, dev = 'develop', baseRelease = 'release/01.007.25') => spawnSync(
    'sh', [validator, repo, kind, branch, source, base, proof, dev, baseRelease], { encoding: 'utf8' },
  );
  try {
    git('init', '-q');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Release Test');
    const base = commit('base', 'production');
    git('switch', '-qc', 'hotfix');
    const hotfix = commit('fix', 'fix');
    git('switch', '-qc', 'develop', base);
    const unrelated = commit('other', 'unrelated develop change');
    git('merge', '--no-ff', '-qm', 'integrate hotfix', 'hotfix');
    const develop = git('rev-parse', 'HEAD');

    assert.equal(check('hotfix', 'release/01.007.26', hotfix, base, hotfix).status, 0);
    assert.notEqual(check('normal', 'release/01.008.00', hotfix, base, develop).status, 0);
    assert.equal(check('normal', 'release/01.008.00', develop, base, develop).status, 0);
    assert.notEqual(check('hotfix', 'release/01.007.26', hotfix, unrelated, hotfix).status, 0);
    assert.notEqual(check('hotfix', 'release/01.007.26', hotfix, base, base).status, 0);
    assert.notEqual(check('normal', 'release/01.007.26', hotfix, base, base).status, 0);
    assert.notEqual(check('hotfix', 'release/01.008.00', hotfix, base, hotfix).status, 0);
    assert.notEqual(check('hotfix', 'release/01.008.01', hotfix, base, hotfix).status, 0);
    assert.notEqual(check('hotfix', 'release/01.007.25', hotfix, base, hotfix).status, 0);

    git('switch', '-q', 'hotfix');
    const unintegrated = commit('next', 'unintegrated');
    assert.notEqual(check('hotfix', 'release/01.007.26', unintegrated, base, unintegrated).status, 0);
    git('merge', '--no-ff', '-qm', 'incorrectly import develop', 'develop');
    const importedDevelop = git('rev-parse', 'HEAD');
    git('branch', '-f', 'develop', importedDevelop);
    assert.notEqual(check('hotfix', 'release/01.007.26', importedDevelop, base, importedDevelop).status, 0);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
