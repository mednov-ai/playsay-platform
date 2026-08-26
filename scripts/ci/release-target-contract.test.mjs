import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { TARGETS } from "./detect-affected-targets.mjs";

const ciDir = dirname(fileURLToPath(import.meta.url));

test("release candidate preparation accepts every detector target", () => {
  const source = readFileSync(resolve(ciDir, "prepare-release-candidate.sh"), "utf8");
  const targetOrder = source.match(/^TARGET_ORDER="([^"]+)"$/mu)?.[1]?.split(/\s+/u);

  assert.deepEqual(targetOrder, TARGETS);
});
