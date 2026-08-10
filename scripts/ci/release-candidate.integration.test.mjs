import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const platformRoot = resolve(testDir, "../..");
const yqBin = process.env.YQ_BIN || "/tmp/playsay-yq-bin/yq";
const helmBin = process.env.HELM_BIN || "/opt/homebrew/bin/helm";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function git(cwd, args, env = process.env) {
  return run("git", args, { cwd, env });
}

function write(root, path, contents) {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function initWorkRepo(path) {
  mkdirSync(path, { recursive: true });
  git(path, ["init", "-q"]);
  git(path, ["config", "user.email", "test@example.com"]);
  git(path, ["config", "user.name", "Release Candidate Test"]);
}

test(
  "release candidate prepare/finalize preserves baseline metadata and reaches ready",
  { skip: !existsSync(yqBin) || !existsSync(helmBin), timeout: 30_000 },
  () => {
    const sandbox = mkdtempSync(resolve(tmpdir(), "playsay-release-candidate-test-"));
    const infraBare = resolve(sandbox, "infra.git");
    const infraWork = resolve(sandbox, "infra-work");
    const platformBare = resolve(sandbox, "platform.git");
    const platformWork = resolve(sandbox, "platform-work");
    const candidateWork = resolve(sandbox, "candidate-work");
    const runner = resolve(sandbox, "runner");
    const oldDigest = `sha256:${"a".repeat(64)}`;
    const newDigest = `sha256:${"b".repeat(64)}`;

    try {
      git(sandbox, ["init", "--bare", "-q", infraBare]);
      git(sandbox, ["init", "--bare", "-q", platformBare]);

      initWorkRepo(platformWork);
      write(platformWork, "frontend/web-app/src/App.tsx", "production\n");
      git(platformWork, ["add", "."]);
      git(platformWork, ["commit", "-qm", "production source"]);
      const basePlatformCommit = git(platformWork, ["rev-parse", "HEAD"]);
      git(platformWork, ["branch", "release/1.001.06"]);
      write(platformWork, "frontend/web-app/src/App.tsx", "candidate\n");
      git(platformWork, ["add", "."]);
      git(platformWork, ["commit", "-qm", "candidate source"]);
      const candidatePlatformCommit = git(platformWork, ["rev-parse", "HEAD"]);
      git(platformWork, ["branch", "release/01.002.00"]);
      git(platformWork, ["remote", "add", "origin", `file://${platformBare}`]);
      git(platformWork, ["push", "-q", "origin", "release/1.001.06", "release/01.002.00"]);

      initWorkRepo(infraWork);
      write(infraWork, "argocd-apps/prod/current-release.txt", "release/1.001.06\n");
      write(
        infraWork,
        "argocd-apps/prod/root-app.yaml",
        "spec:\n  source:\n    targetRevision: release/1.001.06\n",
      );
      write(
        infraWork,
        "argocd-apps/prod/apps/web-app.yaml",
        "spec:\n  source:\n    targetRevision: release/1.001.06\n",
      );
      write(
        infraWork,
        "helm-charts/web-app/Chart.yaml",
        "apiVersion: v2\nname: web-app\nversion: 0.1.0\n",
      );
      write(
        infraWork,
        "helm-charts/web-app/values-prod.yaml",
        [
          "image:",
          "  repository: example.invalid/web-app",
          '  tag: "old"',
          `  digest: "${oldDigest}"`,
          "build:",
          '  name: "old"',
          '  number: "1"',
          '  branch: "release/1.001.06"',
          `  commit: "${basePlatformCommit}"`,
          "",
        ].join("\n"),
      );
      write(
        infraWork,
        "helm-charts/web-app/templates/deployment.yaml",
        [
          "apiVersion: apps/v1",
          "kind: Deployment",
          "metadata:",
          "  name: web-app",
          "spec:",
          "  selector:",
          "    matchLabels:",
          "      app: web-app",
          "  template:",
          "    metadata:",
          "      labels:",
          "        app: web-app",
          "    spec:",
          "      containers:",
          "        - name: web-app",
          '          image: "{{ .Values.image.repository }}@{{ .Values.image.digest }}"',
          "",
        ].join("\n"),
      );
      write(
        infraWork,
        "helm-charts/static/Chart.yaml",
        "apiVersion: v2\nname: static\nversion: 0.1.0\n",
      );
      write(
        infraWork,
        "helm-charts/static/values.yaml",
        [
          "image:",
          "  repository: example.invalid/static",
          '  tag: "stable"',
          "",
        ].join("\n"),
      );
      write(
        infraWork,
        "helm-charts/static/values-prod.yaml",
        "replicaCount: 1\n",
      );
      write(
        infraWork,
        "helm-charts/static/templates/deployment.yaml",
        [
          "apiVersion: apps/v1",
          "kind: Deployment",
          "metadata:",
          "  name: static",
          "spec:",
          "  selector:",
          "    matchLabels:",
          "      app: static",
          "  template:",
          "    metadata:",
          "      labels:",
          "        app: static",
          "    spec:",
          "      containers:",
          "        - name: static",
          '          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"',
          "",
        ].join("\n"),
      );
      git(infraWork, ["add", "."]);
      git(infraWork, ["commit", "-qm", "infra baseline"]);
      git(infraWork, ["branch", "-M", "develop"]);
      git(infraWork, ["branch", "release/1.001.06"]);
      git(infraWork, ["remote", "add", "origin", `file://${infraBare}`]);
      git(infraWork, ["push", "-q", "origin", "develop", "release/1.001.06"]);

      mkdirSync(runner);
      const rewrittenInfraUrl = "https://test:test@example.invalid/infra.git";
      const rewrittenPlatformUrl = "https://example.invalid/platform.git";
      const commonEnv = {
        ...process.env,
        PATH: `${dirname(yqBin)}:${dirname(helmBin)}:${process.env.PATH}`,
        GIT_ALLOW_PROTOCOL: "file:https",
        GIT_CONFIG_COUNT: "2",
        GIT_CONFIG_KEY_0: `url.file://${infraBare}.insteadOf`,
        GIT_CONFIG_VALUE_0: rewrittenInfraUrl,
        GIT_CONFIG_KEY_1: `url.file://${platformBare}.insteadOf`,
        GIT_CONFIG_VALUE_1: rewrittenPlatformUrl,
        INFRA_REPO: "https://example.invalid/infra.git",
        PLATFORM_REPO: rewrittenPlatformUrl,
        CI_BRANCH: "release/01.002.00",
        GIT_COMMIT: candidatePlatformCommit,
        BASE_RELEASE_BRANCH: "release/1.001.06",
        BASE_PLATFORM_COMMIT: basePlatformCommit,
        ACCEPTED_DEV_COMMIT: candidatePlatformCommit,
        AFFECTED_TARGETS: "web-app",
        VALIDATION_SUITES: "ci-contracts",
        GITHUB_USER: "test",
        GITHUB_TOKEN: "test",
        JENKINS_JOB_NAME: "playsay-platform-dispatch-release",
        JENKINS_BUILD_NUMBER: "7",
      };

      const prepare = spawnSync(
        "sh",
        [resolve(platformRoot, "scripts/ci/prepare-release-candidate.sh")],
        { cwd: runner, env: commonEnv, encoding: "utf8" },
      );
      assert.equal(prepare.status, 0, `${prepare.stdout}\n${prepare.stderr}`);
      assert.match(prepare.stdout, /RELEASE_AFFECTED_TARGETS=web-app/);

      const retryPrepare = spawnSync(
        "sh",
        [resolve(platformRoot, "scripts/ci/prepare-release-candidate.sh")],
        {
          cwd: runner,
          env: { ...commonEnv, AFFECTED_TARGETS: "", JENKINS_BUILD_NUMBER: "8" },
          encoding: "utf8",
        },
      );
      assert.equal(retryPrepare.status, 0, `${retryPrepare.stdout}\n${retryPrepare.stderr}`);
      assert.match(retryPrepare.stdout, /RELEASE_AFFECTED_TARGETS=web-app/);

      git(sandbox, ["clone", "-q", "--branch", "release/01.002.00", `file://${infraBare}`, candidateWork]);
      const manifestPath = resolve(candidateWork, "argocd-apps/prod/release-candidate.yaml");
      assert.match(readFileSync(manifestPath, "utf8"), /status: building/);
      assert.equal(
        run(yqBin, ["-r", ".image.digest", resolve(candidateWork, "helm-charts/web-app/values-prod.yaml")]),
        oldDigest,
      );
      const staticValues = readFileSync(
        resolve(candidateWork, "helm-charts/static/values-prod.yaml"),
        "utf8",
      );
      assert.doesNotMatch(staticValues, /^image:\s*null$/m);
      assert.doesNotMatch(staticValues, /^build:\s*null$/m);

      const incompleteFinalize = spawnSync(
        "sh",
        [resolve(platformRoot, "scripts/ci/finalize-release-candidate.sh")],
        { cwd: runner, env: commonEnv, encoding: "utf8" },
      );
      assert.notEqual(incompleteFinalize.status, 0);
      assert.match(incompleteFinalize.stderr, /Affected target web-app was not built/);
      assert.match(readFileSync(manifestPath, "utf8"), /status: building/);

      git(candidateWork, ["config", "user.email", "test@example.com"]);
      git(candidateWork, ["config", "user.name", "Release Candidate Test"]);
      const candidateValues = resolve(candidateWork, "helm-charts/web-app/values-prod.yaml");
      run(yqBin, [
        "-i",
        `.image.tag = "new" | .image.digest = "${newDigest}" | .build.name = "new" | .build.number = "2" | .build.branch = "release/01.002.00" | .build.commit = "${candidatePlatformCommit}"`,
        candidateValues,
      ]);
      git(candidateWork, ["add", candidateValues]);
      git(candidateWork, ["commit", "-qm", "candidate image"]);
      git(candidateWork, ["push", "-q", "origin", "HEAD:release/01.002.00"]);

      const finalize = spawnSync(
        "sh",
        [resolve(platformRoot, "scripts/ci/finalize-release-candidate.sh")],
        { cwd: runner, env: commonEnv, encoding: "utf8" },
      );
      assert.equal(finalize.status, 0, `${finalize.stdout}\n${finalize.stderr}`);

      rmSync(candidateWork, { recursive: true, force: true });
      git(sandbox, ["clone", "-q", "--branch", "release/01.002.00", `file://${infraBare}`, candidateWork]);
      assert.equal(
        run(yqBin, ["-r", ".status", resolve(candidateWork, "argocd-apps/prod/release-candidate.yaml")]),
        "ready",
      );
      assert.equal(
        run(yqBin, ["-r", ".image.digest", resolve(candidateWork, "helm-charts/web-app/values-prod.yaml")]),
        newDigest,
      );
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  },
);
