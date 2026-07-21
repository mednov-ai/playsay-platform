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

test("legacy dispatcher fixes downstream concurrency to one", () => {
  assert.match(dispatcher, /string\(name: 'MAX_PARALLEL_MODULE_JOBS', defaultValue: '1'/);
  assert.match(dispatcher, /MAX_PARALLEL_MODULE_JOBS is fixed to 1 on the single-node dev cluster/);
  assert.doesNotMatch(dispatcher, /maxParallelModuleJobs =/);
});

test("legacy dispatcher runs downstream jobs sequentially and aggregates their results", () => {
  assert.match(dispatcher, /jobs\.eachWithIndex/);
  assert.doesNotMatch(dispatcher, /collate\(/);
  assert.doesNotMatch(dispatcher, /parallel branches/);
  assert.match(dispatcher, /wait: true, propagate: false/);
  assert.doesNotMatch(dispatcher, /wait: false, propagate: false/);
  assert.match(dispatcher, /Downstream module job results:/);
  assert.match(dispatcher, /Downstream module job failures:/);
});

test("dispatcher job XML exposes the same concurrency parameter", { skip: !existsSync(dispatchJobXmlPath) }, () => {
  const dispatchJobXml = readFileSync(dispatchJobXmlPath, "utf8");
  assert.match(dispatchJobXml, /<name>MAX_PARALLEL_MODULE_JOBS<\/name>/);
  assert.match(dispatchJobXml, /<defaultValue>1<\/defaultValue>/);
  assert.match(dispatchJobXml, /Maximum downstream module jobs to run at once/);
});
