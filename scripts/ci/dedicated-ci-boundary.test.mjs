import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

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

test("dedicated CI module pipelines use only the scoped dev kubeconfig", () => {
  for (const pipelineName of modulePipelines) {
    const pipeline = readFileSync(resolve(platformRoot, pipelineName), "utf8");
    assert.match(pipeline, /PLAYSAY_DEDICATED_CI = 'true'/, pipelineName);
    assert.match(pipeline, /KUBECONFIG = credentials\('dev-kubeconfig'\)/, pipelineName);
    assert.doesNotMatch(pipeline, /prod-kubeconfig|values-prod|playsay-prod/, pipelineName);
  }
});

test("shared-node capacity manager exits before any Kubernetes access", () => {
  const script = readFileSync(resolve(platformRoot, "scripts/ci/manage-build-capacity.sh"), "utf8");
  const guardIndex = script.indexOf('if [ "${PLAYSAY_DEDICATED_CI:-false}" = "true" ]');
  const firstKubectlIndex = script.indexOf("kubectl");
  assert.ok(guardIndex >= 0, "dedicated CI guard must exist");
  assert.ok(firstKubectlIndex > guardIndex, "guard must run before kubectl");
});
