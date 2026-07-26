import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const platformRoot = resolve(testDir, "../..");
const modulePipelines = [
  "Jenkinsfile.ai-tutor-service",
  "Jenkinsfile.api-gateway",
  "Jenkinsfile.collaboration-service",
  "Jenkinsfile.email-service",
  "Jenkinsfile.keyboard-backend",
  "Jenkinsfile.keyboard-frontend",
  "Jenkinsfile.media-service",
  "Jenkinsfile.payment-service",
  "Jenkinsfile.registration-service",
  "Jenkinsfile.vocabulary-service",
  "Jenkinsfile.web-app",
];

test("module pipelines route numeric release branches to prod only", () => {
  for (const pipelineName of modulePipelines) {
    const pipeline = readFileSync(resolve(platformRoot, pipelineName), "utf8");

    assert.match(
      pipeline,
      /DEPLOY_TO_PROD = \(env\.CI_BRANCH ==~ \^?\/\^release\\\/\[0-9\]\+/,
      pipelineName,
    );
    assert.match(pipeline, /env\.INFRA_BRANCH = env\.DEPLOY_TO_PROD == 'true' \? env\.CI_BRANCH : 'develop'/, pipelineName);
    assert.doesNotMatch(
      pipeline,
      /^\s*INFRA_BRANCH\s*=\s*'develop'\s*$/m,
      `${pipelineName} must not let Declarative Pipeline reset the computed release branch between stages`,
    );
    assert.match(pipeline, /stage\('Build and push image'\)[\s\S]*?env\.DEPLOY_IMAGE == 'true'/, pipelineName);
    assert.match(pipeline, /stage\('Update environment image reference'\)[\s\S]*?env\.DEPLOY_IMAGE == 'true'/, pipelineName);

    const devRouting = pipeline.match(/env\.DEPLOY_TO_DEV = \(([\s\S]*?)\n          \)\.toString\(\)/)?.[1] ?? "";
    assert.doesNotMatch(devRouting, /release\//, pipelineName);
  }
});

test("release routing never grants Jenkins production cluster credentials", () => {
  for (const pipelineName of modulePipelines) {
    const pipeline = readFileSync(resolve(platformRoot, pipelineName), "utf8");
    assert.doesNotMatch(pipeline, /prod-kubeconfig|playsay-prod/, pipelineName);
    assert.match(pipeline, /KUBECONFIG = credentials\('dev-kubeconfig'\)/, pipelineName);
    assert.match(
      pipeline,
      /assert-current-branch-head\.sh && CHART_NAME=/,
      `${pipelineName} must not update GitOps from a stale branch head`,
    );
  }
});

test("image update helper pins dev and prod digests and matches release branches", () => {
  const helper = readFileSync(resolve(platformRoot, "scripts/ci/update-environment-image.sh"), "utf8");
  const routedHelper = readFileSync(resolve(platformRoot, "scripts/ci/update-routed-image-reference.sh"), "utf8");
  assert.match(helper, /\^release\/\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$/);
  assert.match(helper, /if \[ "\$INFRA_BRANCH" != "\$CI_BRANCH" \]/);
  assert.match(helper, /\^sha256:\[0-9a-f\]\{64\}\$/);
  assert.match(helper, /\.image\.digest = strenv\(IMAGE_DIGEST\)/);
  assert.match(helper, /helm-charts\/\*\/values-prod\.yaml/);
  assert.match(helper, /argocd-apps\/prod\/current-release\.txt/);
  assert.match(helper, /START_DIR="\$\(pwd\)"/);
  assert.match(helper, /cd "\$START_DIR"\s+rm -rf "\$WORK_DIR"\s+echo "Infra push race/);
  assert.match(routedHelper, /Missing image digest produced by Kaniko/);
  assert.match(routedHelper, /IMAGE_DIGEST=.*image-digest\.txt/);
});

test("release candidate lifecycle preserves a manual production gate", () => {
  const prepare = readFileSync(resolve(platformRoot, "scripts/ci/prepare-release-candidate.sh"), "utf8");
  const finalize = readFileSync(resolve(platformRoot, "scripts/ci/finalize-release-candidate.sh"), "utf8");

  assert.match(prepare, /status: building/);
  assert.match(prepare, /argocd-apps\/prod\/current-release\.txt/);
  assert.match(prepare, /\.image = load\(strenv\(BASE_VALUES_FILE\)\)\.image/);
  assert.match(prepare, /previous_status.*!= "ready"/);
  assert.match(prepare, /RELEASE_AFFECTED_TARGETS=/);

  assert.match(finalize, /manifest_status.*"building"/);
  assert.match(finalize, /\.build\.commit/);
  assert.match(finalize, /Unaffected chart .* changed image\/build metadata/);
  assert.match(
    finalize,
    /helm repo add bitnami "\$repository" --force-update/,
  );
  assert.match(finalize, /Unsupported Helm dependency repository/);
  assert.match(finalize, /helm template/);
  assert.match(finalize, /\.status = "ready"/);
  assert.doesNotMatch(`${prepare}\n${finalize}`, /prod-kubeconfig|kubectl/);
});

test("image update retry reclones from a stable working directory after a push race", () => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "playsay-image-update-test-"));
  const stableSandbox = realpathSync(sandbox);
  const binDir = resolve(sandbox, "bin");
  const pushCountFile = resolve(sandbox, "push-count");
  mkdirSync(binDir);

  writeFileSync(
    resolve(binDir, "git"),
    `#!/bin/sh
set -eu
command="$1"
shift
case "$command" in
  ls-remote)
    [ "$PWD" = "$EXPECTED_START_DIR" ] || {
      echo "ls-remote ran outside the stable workspace: $PWD" >&2
      exit 91
    }
    exit 0
    ;;
  clone)
    while [ "$#" -gt 1 ]; do shift; done
    mkdir -p "$1/helm-charts/web-app"
    : > "$1/helm-charts/web-app/values-dev.yaml"
    exit 0
    ;;
  diff)
    exit 1
    ;;
  push)
    count=0
    [ ! -f "$PUSH_COUNT_FILE" ] || count="$(cat "$PUSH_COUNT_FILE")"
    count=$((count + 1))
    printf '%s\\n' "$count" > "$PUSH_COUNT_FILE"
    [ "$count" -gt 1 ]
    ;;
  *)
    exit 0
    ;;
esac
`,
  );
  writeFileSync(resolve(binDir, "yq"), "#!/bin/sh\nexit 0\n");
  chmodSync(resolve(binDir, "git"), 0o755);
  chmodSync(resolve(binDir, "yq"), 0o755);

  try {
    const result = spawnSync("sh", [resolve(platformRoot, "scripts/ci/update-environment-image.sh")], {
      cwd: sandbox,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        EXPECTED_START_DIR: stableSandbox,
        PUSH_COUNT_FILE: pushCountFile,
        DEPLOY_ENVIRONMENT: "dev",
        INFRA_REPO: "https://example.invalid/playsay-infra.git",
        INFRA_BRANCH: "develop",
        GITHUB_USER: "test",
        GITHUB_TOKEN: "test",
        CHART_VALUES_FILE: "helm-charts/web-app/values-dev.yaml",
        BUILD_LABEL: "web-dev-999",
        BUILD_NUMBER: "999",
        CI_BRANCH: "develop",
        BUILD_LABEL_PREFIX: "dev",
        GIT_COMMIT: "0123456789abcdef0123456789abcdef01234567",
        GIT_COMMIT_SHORT: "0123456789ab",
        IMAGE_DIGEST: `sha256:${"a".repeat(64)}`,
        CREATE_INFRA_TAG: "false",
      },
    });

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(readFileSync(pushCountFile, "utf8").trim(), "2");
    assert.match(result.stdout, /Infra push race for web-dev-999; retrying 1\/5/);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("Kaniko publishes a mutable dev tag only for dev builds", () => {
  const helper = readFileSync(resolve(platformRoot, "scripts/ci/run-kaniko-image-build.sh"), "utf8");
  assert.match(helper, /--digest-file "\$DIGEST_FILE"/);
  assert.match(helper, /if \[ "\$DEPLOY_TO_DEV" = "true" \]/);
  assert.match(helper, /--destination "\$\{IMAGE_REPOSITORY\}:dev"/);
});
