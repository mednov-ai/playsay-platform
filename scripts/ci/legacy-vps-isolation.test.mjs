import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const legacyBranch = "legacy/play-and-say-vps";

test("every legacy Jenkins pipeline is pinned to the legacy platform branch", () => {
  const jenkinsfiles = readdirSync(projectRoot)
    .filter((name) => name === "Jenkinsfile" || name.startsWith("Jenkinsfile."))
    .sort();

  assert.equal(jenkinsfiles.length, 13);
  for (const filename of jenkinsfiles) {
    const source = readFileSync(resolve(projectRoot, filename), "utf8");
    assert.doesNotMatch(source, /name: 'BRANCH_NAME'/, filename);
    assert.doesNotMatch(source, /params\.BRANCH_NAME/, filename);
    assert.match(source, new RegExp(`requestedBranch = '${legacyBranch}'`), filename);

    if (filename !== "Jenkinsfile.dispatcher") {
      assert.match(source, new RegExp(`INFRA_BRANCH = '${legacyBranch}'`), filename);
      assert.match(
        source,
        new RegExp(`DEPLOY_TO_DEV = \\(env\\.CI_BRANCH == '${legacyBranch}'\\)\\.toString\\(\\)`),
        filename,
      );
    }
  }
});

test("legacy dispatcher targets only legacy jobs", () => {
  const detector = readFileSync(resolve(projectRoot, "scripts/ci/detect-affected-targets.mjs"), "utf8");
  assert.doesNotMatch(detector, /playsay-[a-z-]+-develop/);
  assert.match(detector, /playsay-legacy-vps-web-app/);
  assert.match(detector, /playsay-legacy-vps-keyboard-frontend/);
});

test("legacy product authentication stays on the old Keycloak", () => {
  const authFiles = [
    "frontend/web-app/src/shared/api/auth.ts",
    "frontend/keyboard-app/src/shared/auth/oidc.ts",
  ];

  for (const filename of authFiles) {
    const source = readFileSync(resolve(projectRoot, filename), "utf8");
    assert.match(source, /https:\/\/ops\.play-and-say\.ru:18443\/keycloak\/realms\/playsay/);
    assert.doesNotMatch(source, /honey\.school/);
  }
});
