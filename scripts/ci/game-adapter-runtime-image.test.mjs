import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lock = JSON.parse(readFileSync("frontend/package-lock.json", "utf8"));
const dockerfile = readFileSync("frontend/game-adapter-service/Dockerfile", "utf8");

test("game adapter runtime image includes sharp's hoisted detect-libc dependency", () => {
  assert.ok(lock.packages["node_modules/sharp"].dependencies["detect-libc"]);
  assert.match(
    dockerfile,
    /COPY --from=build \/workspace\/frontend\/node_modules\/detect-libc \/app\/node_modules\/detect-libc/,
  );
});
