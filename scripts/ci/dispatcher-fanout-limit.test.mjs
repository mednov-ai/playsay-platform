import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const platformRoot = resolve(scriptDir, "../..");
const projectRoot = resolve(platformRoot, "..");
const dispatcher = readFileSync(resolve(platformRoot, "Jenkinsfile.dispatcher"), "utf8");
const webhookDispatchJobXmlPath = resolve(projectRoot, "playsay-infra/jenkins/jobs/playsay-platform-dispatch-webhook.xml");
const developDispatchJobXmlPath = resolve(projectRoot, "playsay-infra/jenkins/jobs/playsay-platform-dispatch-develop.xml");
const releaseDispatchJobXmlPath = resolve(projectRoot, "playsay-infra/jenkins/jobs/playsay-platform-dispatch-release.xml");

test("dispatcher validates the four-agent operator override", () => {
  assert.match(dispatcher, /MAX_PARALLEL_MODULE_JOBS must be between 1 and 4/);
  assert.match(dispatcher, /maxParallelModuleJobs = maxParallelText\.toInteger\(\)/);
});

test("dispatcher runs downstream jobs in bounded batches and aggregates their results", () => {
  assert.match(dispatcher, /jobs\.collate\(maxParallelModuleJobs\)/);
  assert.match(dispatcher, /batchResults = parallel branches/);
  assert.match(dispatcher, /wait: true, propagate: false/);
  assert.match(dispatcher, /Downstream module job results:/);
  assert.match(dispatcher, /Downstream module job failures:/);
  assert.doesNotMatch(dispatcher, /catch \(err\)/);
});

test(
  "webhook and internal dispatcher jobs expose the same four-agent parameter",
  {
    skip:
      !existsSync(webhookDispatchJobXmlPath) ||
      !existsSync(developDispatchJobXmlPath) ||
      !existsSync(releaseDispatchJobXmlPath),
  },
  () => {
    for (const dispatchJobXmlPath of [
      webhookDispatchJobXmlPath,
      developDispatchJobXmlPath,
      releaseDispatchJobXmlPath,
    ]) {
      const dispatchJobXml = readFileSync(dispatchJobXmlPath, "utf8");
      assert.match(dispatchJobXml, /<name>MAX_PARALLEL_MODULE_JOBS<\/name>/);
      assert.match(dispatchJobXml, /<defaultValue>4<\/defaultValue>/);
      assert.match(dispatchJobXml, /Maximum downstream module jobs/);
      assert.match(dispatchJobXml, /<name>ACCEPTED_DEV_COMMIT<\/name>/);
    }
  },
);

test(
  "one webhook router feeds triggerless internal dispatchers with independent concurrency",
  {
    skip:
      !existsSync(webhookDispatchJobXmlPath) ||
      !existsSync(developDispatchJobXmlPath) ||
      !existsSync(releaseDispatchJobXmlPath),
  },
  () => {
    const webhookXml = readFileSync(webhookDispatchJobXmlPath, "utf8");
    const developXml = readFileSync(developDispatchJobXmlPath, "utf8");
    const releaseXml = readFileSync(releaseDispatchJobXmlPath, "utf8");

    assert.match(webhookXml, /<tokenCredentialId>github-webhook-token<\/tokenCredentialId>/);
    assert.match(
      webhookXml,
      /\^refs\/heads\/\(develop\|release\/\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\) /,
    );
    assert.match(webhookXml, /playsay-platform-dispatch-develop/);
    assert.match(webhookXml, /playsay-platform-dispatch-release/);
    assert.match(webhookXml, /string\(name: 'ACCEPTED_DEV_COMMIT', value: acceptedDevCommit\)/);

    assert.match(developXml, /<abortPrevious>true<\/abortPrevious>/);
    assert.match(releaseXml, /<abortPrevious>false<\/abortPrevious>/);
    for (const internalXml of [developXml, releaseXml]) {
      assert.doesNotMatch(internalXml, /GenericTrigger/);
      assert.doesNotMatch(internalXml, /tokenCredentialId/);
      assert.match(internalXml, /<triggers\/>/);
    }
  },
);

test("dispatcher validates CI-only changes and brackets release builds with candidate stages", () => {
  assert.doesNotMatch(dispatcher, /disableConcurrentBuilds\(\)/);
  assert.match(dispatcher, /VALIDATION_SUITES/);
  assert.match(dispatcher, /validate-ci-contracts\.sh/);
  assert.match(dispatcher, /stage\('Prepare release candidate'\)/);
  assert.match(dispatcher, /prepare-release-candidate\.sh/);
  assert.match(dispatcher, /stage\('Finalize release candidate'\)/);
  assert.match(dispatcher, /finalize-release-candidate\.sh/);
  assert.match(
    dispatcher,
    /stage\('Finalize release candidate'\)[\s\S]*?name: tools[\s\S]*?limits:[\s\S]*?memory: 1Gi/,
    "release finalization needs enough memory to render every production chart",
  );
});
