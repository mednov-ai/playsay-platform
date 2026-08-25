import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const platformRoot = resolve(testDir, "../..");
const pipeline = readFileSync(resolve(platformRoot, "Jenkinsfile.web-app"), "utf8");

test("shared external activities stay enabled on dev and disabled in production", () => {
  const developmentBranch = pipeline.match(/if \[ "\$DEPLOY_TO_DEV" = "true" \]; then([\s\S]*?)\n              elif/)?.[1] ?? "";
  const productionBranch = pipeline.match(/elif \[ "\$DEPLOY_TO_PROD" = "true" \]; then([\s\S]*?)\n              fi/)?.[1] ?? "";

  assert.match(developmentBranch, /export VITE_EXTERNAL_ACTIVITY_ENABLED=true/);
  assert.doesNotMatch(productionBranch, /VITE_EXTERNAL_ACTIVITY_ENABLED/);
});
