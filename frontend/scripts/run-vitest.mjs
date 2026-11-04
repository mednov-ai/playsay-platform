import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const vitest = join(dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const environment = { ...process.env };

// Node 26 exposes an unavailable global localStorage that masks jsdom's storage.
// Set NODE_OPTIONS so Vitest's worker processes inherit the same setting.
if (process.allowedNodeEnvironmentFlags.has("--no-experimental-webstorage")) {
  environment.NODE_OPTIONS = [environment.NODE_OPTIONS, "--no-experimental-webstorage"].filter(Boolean).join(" ");
}

const result = spawnSync(process.execPath, [vitest, ...process.argv.slice(2)], {
  env: environment,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
