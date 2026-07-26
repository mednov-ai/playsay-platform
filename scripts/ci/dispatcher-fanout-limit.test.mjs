import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const platformRoot = resolve(scriptDir, "../..");
const projectRoot = resolve(platformRoot, "..");
const dispatcher = readFileSync(resolve(platformRoot, "Jenkinsfile.dispatcher"), "utf8");
const developDispatchJobXmlPath = resolve(projectRoot, "playsay-infra/jenkins/jobs/playsay-platform-dispatch-develop.xml");
const releaseDispatchJobXmlPath = resolve(projectRoot, "playsay-infra/jenkins/jobs/playsay-platform-dispatch-release.xml");

test("dispatcher defaults to four downstream jobs and validates the operator override", () => {
  assert.match(dispatcher, /string\(name: 'MAX_PARALLEL_MODULE_JOBS', defaultValue: '4'/);
  assert.match(dispatcher, /MAX_PARALLEL_MODULE_JOBS must be between 1 and 4/);
  assert.match(dispatcher, /maxParallelModuleJobs = maxParallelText\.toInteger\(\)/);
});

test("dispatcher runs downstream jobs in bounded batches and aggregates their results", () => {
  assert.match(dispatcher, /jobs\.collate\(maxParallelModuleJobs\)/);
  assert.match(dispatcher, /batchResults = parallel branches/);
  assert.match(dispatcher, /wait: true, propagate: false/);
  assert.match(dispatcher, /Downstream module job results:/);
  assert.match(dispatcher, /Downstream module job failures:/);
});

test(
  "develop and release dispatcher jobs expose the same four-agent parameter",
  { skip: !existsSync(developDispatchJobXmlPath) || !existsSync(releaseDispatchJobXmlPath) },
  () => {
    for (const dispatchJobXmlPath of [developDispatchJobXmlPath, releaseDispatchJobXmlPath]) {
      const dispatchJobXml = readFileSync(dispatchJobXmlPath, "utf8");
      assert.match(dispatchJobXml, /<name>MAX_PARALLEL_MODULE_JOBS<\/name>/);
      assert.match(dispatchJobXml, /<defaultValue>4<\/defaultValue>/);
      assert.match(dispatchJobXml, /Maximum downstream module jobs to run concurrently/);
    }
  },
);

test(
  "develop aborts stale dispatchers while numeric releases serialize independently",
  { skip: !existsSync(developDispatchJobXmlPath) || !existsSync(releaseDispatchJobXmlPath) },
  () => {
    const developXml = readFileSync(developDispatchJobXmlPath, "utf8");
    const releaseXml = readFileSync(releaseDispatchJobXmlPath, "utf8");
    assert.match(developXml, /<abortPrevious>true<\/abortPrevious>/);
    assert.match(developXml, /\^refs\/heads\/develop /);
    assert.doesNotMatch(developXml, /release\/\.\+/);
    assert.match(releaseXml, /<abortPrevious>false<\/abortPrevious>/);
    assert.match(releaseXml, /\^refs\/heads\/release\/\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+ /);
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
});
