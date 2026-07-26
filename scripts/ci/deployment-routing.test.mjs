import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
  assert.match(routedHelper, /Missing image digest produced by Kaniko/);
  assert.match(routedHelper, /IMAGE_DIGEST=.*image-digest\.txt/);
});

test("Kaniko publishes a mutable dev tag only for dev builds", () => {
  const helper = readFileSync(resolve(platformRoot, "scripts/ci/run-kaniko-image-build.sh"), "utf8");
  assert.match(helper, /--digest-file "\$DIGEST_FILE"/);
  assert.match(helper, /if \[ "\$DEPLOY_TO_DEV" = "true" \]/);
  assert.match(helper, /--destination "\$\{IMAGE_REPOSITORY\}:dev"/);
});
