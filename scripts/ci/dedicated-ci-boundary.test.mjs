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
const allPipelines = ["Jenkinsfile", "Jenkinsfile.dispatcher", ...modulePipelines];
const databasePipelines = new Map([
  ["Jenkinsfile.ai-tutor-service", "ai-tutor-service"],
  ["Jenkinsfile.api-gateway", "api-gateway"],
  ["Jenkinsfile.email-service", "email-service"],
  ["Jenkinsfile.keyboard-backend", "keyboard-service"],
  ["Jenkinsfile.payment-service", "payment-service"],
  ["Jenkinsfile.registration-service", "registration-service"],
  ["Jenkinsfile.vocabulary-service", "vocabulary-service"],
]);

test("dedicated CI module pipelines use only the scoped dev kubeconfig", () => {
  for (const pipelineName of modulePipelines) {
    const pipeline = readFileSync(resolve(platformRoot, pipelineName), "utf8");
    assert.match(pipeline, /PLAYSAY_DEDICATED_CI = 'true'/, pipelineName);
    assert.match(pipeline, /KUBECONFIG = credentials\('dev-kubeconfig'\)/, pipelineName);
    assert.doesNotMatch(pipeline, /prod-kubeconfig|values-prod|playsay-prod/, pipelineName);
  }
});

test("dedicated CI pipelines have no legacy capacity sidecars or database secrets", () => {
  for (const pipelineName of allPipelines) {
    const pipeline = readFileSync(resolve(platformRoot, pipelineName), "utf8");
    assert.doesNotMatch(pipeline, /capacity-guard|manage-build-capacity|playsay-ci-capacity-scripts/, pipelineName);
    assert.doesNotMatch(pipeline, /name: liquibase|container\('liquibase'\)/, pipelineName);
    assert.doesNotMatch(pipeline, /secretKeyRef:\s*\n\s*name: playsay-(?:app|keyboard)-db/, pipelineName);
  }
});

test("database pipelines delegate Liquibase to scoped dev Jobs", () => {
  for (const [pipelineName, moduleName] of databasePipelines) {
    const pipeline = readFileSync(resolve(platformRoot, pipelineName), "utf8");
    assert.match(pipeline, new RegExp(`run-dev-liquibase-job\\.sh ${moduleName} `), pipelineName);
  }

  const aggregatePipeline = readFileSync(resolve(platformRoot, "Jenkinsfile"), "utf8");
  for (const moduleName of ["api-gateway", "payment-service", "registration-service", "email-service"]) {
    assert.match(aggregatePipeline, new RegExp(`run-dev-liquibase-job\\.sh ${moduleName} `), moduleName);
  }
});

test("migration launcher is dev-only and never reads database Secret objects", () => {
  const script = readFileSync(resolve(platformRoot, "scripts/ci/run-dev-liquibase-job.sh"), "utf8");
  assert.match(script, /namespace="playsay-dev"/);
  assert.match(script, /kubectl -n "\$namespace" create configmap/);
  assert.match(script, /kubectl create -f -/);
  assert.doesNotMatch(script, /playsay-prod|kubectl[^\n]*get secret/);
});

test("migration launcher preserves nested changelog paths in the ConfigMap projection", () => {
  const script = readFileSync(resolve(platformRoot, "scripts/ci/run-dev-liquibase-job.sh"), "utf8");
  assert.match(script, /find "\$changelog_dir" -type f/);
  assert.match(script, /configmap_key="\$\(printf 'file-%04d'/);
  assert.match(script, /--arg path "\$changelog_dir\/\$relative_path"/);
  assert.doesNotMatch(script, /Nested changelog directories are not supported/);
});
