import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const platformRoot = resolve(scriptDir, "../..");
const projectRoot = resolve(platformRoot, "..");
const dispatcher = readFileSync(resolve(platformRoot, "Jenkinsfile.dispatcher"), "utf8");
const dispatchJobXmlPath = resolve(projectRoot, "playsay-infra/jenkins/jobs/playsay-platform-dispatch-develop.xml");

test("dispatcher exposes a bounded downstream concurrency parameter", () => {
  assert.match(dispatcher, /string\(name: 'MAX_PARALLEL_MODULE_JOBS', defaultValue: '2'/);
  assert.match(dispatcher, /MAX_PARALLEL_MODULE_JOBS must be an integer from 1 to 9/);
  assert.match(dispatcher, /maxParallelModuleJobs = maxParallelText\.toInteger\(\)/);
});

test("dispatcher batches downstream jobs and aggregates their results", () => {
  assert.match(dispatcher, /collate\(maxParallelModuleJobs\)/);
  assert.match(dispatcher, /parallel branches/);
  assert.match(dispatcher, /wait: true, propagate: false/);
  assert.doesNotMatch(dispatcher, /wait: false, propagate: false/);
  assert.match(dispatcher, /downstream-results/);
  assert.match(dispatcher, /Downstream module job failures:/);
});

test("dispatcher job XML exposes the same concurrency parameter", { skip: !existsSync(dispatchJobXmlPath) }, () => {
  const dispatchJobXml = readFileSync(dispatchJobXmlPath, "utf8");
  assert.match(dispatchJobXml, /<name>MAX_PARALLEL_MODULE_JOBS<\/name>/);
  assert.match(dispatchJobXml, /<defaultValue>2<\/defaultValue>/);
  assert.match(dispatchJobXml, /Maximum downstream module jobs to run at once/);
});
