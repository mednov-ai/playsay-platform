import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const platformRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function buildEnvironment(pipeline, workspace, dev, prod) {
  const source = readFileSync(resolve(platformRoot, pipeline), "utf8");
  const script = source.split("sh '''").find(part =>
    part.split("'''")[0].includes(`npm --workspace ${workspace} run build`)
  );
  assert.ok(script);
  const prefix = script.split(`npm --workspace ${workspace} run build`)[0];
  const output = execFileSync("sh", ["-eu", "-c", prefix + "env"], {
    env: { PATH: process.env.PATH, DEPLOY_TO_DEV: String(dev), DEPLOY_TO_PROD: String(prod) },
    encoding: "utf8",
  });
  return Object.fromEntries(output.split("\n").filter(line => line.startsWith("VITE_")).map(line => line.split("=")));
}

test("dev and production enable the same accepted web features with their own Key origins", () => {
  const dev = buildEnvironment("Jenkinsfile.web-app", "web-app", true, false);
  const prod = buildEnvironment("Jenkinsfile.web-app", "web-app", false, true);
  assert.equal(dev.VITE_KEYBOARD_ORIGIN, "https://dev.key.honey.school");
  assert.equal(prod.VITE_KEYBOARD_ORIGIN, "https://key.honey.school");
  assert.equal(prod.VITE_EXTERNAL_ACTIVITY_ENABLED, "true");
  assert.equal(prod.VITE_DOCUMENT_MATERIALS_ENABLED, "true");
  assert.equal(prod.VITE_PERSONAL_PRACTICE_V2_ENABLED, "true");
  assert.deepEqual({ ...dev, VITE_KEYBOARD_ORIGIN: prod.VITE_KEYBOARD_ORIGIN }, prod);
  assert.deepEqual(buildEnvironment("Jenkinsfile.web-app", "web-app", false, false), {});
});

test("both deployed Key builds support typed vocabulary targets", () => {
  for (const dev of [true, false]) {
    assert.equal(buildEnvironment("Jenkinsfile.keyboard-frontend", "keyboard-app", dev, !dev).VITE_VOCABULARY_TYPED_TARGETS_ENABLED, "true");
  }
});
