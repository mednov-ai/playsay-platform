import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const platformRoot = resolve(testDir, "../..");
const pipeline = readFileSync(resolve(platformRoot, "Jenkinsfile.web-app"), "utf8");

test("production web builds enable shared external activities and fail closed", () => {
  const productionBranch = pipeline.match(/elif \[ "\$DEPLOY_TO_PROD" = "true" \]; then([\s\S]*?)\n              fi/)?.[1] ?? "";

  assert.match(productionBranch, /export VITE_EXTERNAL_ACTIVITY_ENABLED=true/);
  assert.match(
    pipeline,
    /if \[ "\$DEPLOY_TO_PROD" = "true" \] && \[ "\$\{VITE_EXTERNAL_ACTIVITY_ENABLED:-\}" != "true" \]; then/,
  );
  assert.match(pipeline, /Production web builds must enable shared external activities/);
});
