import assert from "node:assert/strict";
import test from "node:test";

import { detectTargetsForPaths, detectTargetsFromGitRange } from "./detect-affected-targets.mjs";

function assertDetection(paths, expectedTargets, expectedJobs, options = {}) {
  const result = detectTargetsForPaths(paths, options);
  assert.deepEqual(result.targets, expectedTargets);
  assert.deepEqual(
    result.jobs.map((job) => job.name),
    expectedJobs,
  );
}

test("keyboard frontend changes trigger only keyboard frontend job", () => {
  assertDetection(
    ["frontend/keyboard-app/src/App.tsx", "frontend/keyboard-app/package.json"],
    ["keyboard-app"],
    ["playsay-keyboard-frontend-develop"],
  );
});

test("keyboard backend changes trigger only keyboard backend job", () => {
  assertDetection(
    ["backend/keyboard-service/src/main/kotlin/com/playsay/keyboard/KeyboardController.kt"],
    ["keyboard-service"],
    ["playsay-keyboard-backend-develop"],
  );
});

test("web-app changes trigger core job with web-app only", () => {
  const result = detectTargetsForPaths(["frontend/web-app/src/App.tsx"]);
  assert.deepEqual(result.targets, ["web-app"]);
  assert.deepEqual(result.jobs, [
    {
      name: "playsay-platform-develop",
      targets: ["web-app"],
      parameters: { AFFECTED_TARGETS: "web-app" },
    },
  ]);
});

test("api-gateway and contract changes trigger api-gateway and web-app", () => {
  assertDetection(
    ["backend/api-gateway/src/main/kotlin/com/playsay/gateway/GatewayController.kt", "contracts/openapi.yaml"],
    ["api-gateway", "web-app"],
    ["playsay-platform-develop"],
  );
});

test("shared backend changes trigger all backend targets including keyboard backend", () => {
  assertDetection(
    ["backend/shared-kotlin/src/main/kotlin/com/playsay/shared/Clock.kt"],
    ["api-gateway", "media-service", "payment-service", "keyboard-service"],
    ["playsay-platform-develop", "playsay-keyboard-backend-develop"],
  );
});

test("shared frontend lockfile changes trigger web-app and keyboard frontend", () => {
  assertDetection(
    ["frontend/package-lock.json"],
    ["web-app", "keyboard-app"],
    ["playsay-platform-develop", "playsay-keyboard-frontend-develop"],
  );
});

test("docs-only changes do not trigger downstream jobs", () => {
  const result = detectTargetsForPaths(["README.md", "docs/dev-setup.md", "backend/api-gateway/README.md"]);
  assert.deepEqual(result.targets, []);
  assert.deepEqual(result.jobs, []);
  assert.equal(result.reason, "docs-only");
});

test("unknown source paths fail safe to all targets", () => {
  const result = detectTargetsForPaths(["new-tooling/config.yml"]);
  assert.deepEqual(result.targets, [
    "api-gateway",
    "web-app",
    "collaboration-service",
    "media-service",
    "payment-service",
    "keyboard-service",
    "keyboard-app",
  ]);
  assert.deepEqual(
    result.jobs.map((job) => job.name),
    ["playsay-platform-develop", "playsay-keyboard-backend-develop", "playsay-keyboard-frontend-develop"],
  );
  assert.equal(result.reason, "unknown-path");
});

test("invalid diff base fails safe to all targets", () => {
  const result = detectTargetsFromGitRange({
    before: "0000000000000000000000000000000000000000",
    after: "1111111111111111111111111111111111111111",
  });
  assert.deepEqual(result.targets, [
    "api-gateway",
    "web-app",
    "collaboration-service",
    "media-service",
    "payment-service",
    "keyboard-service",
    "keyboard-app",
  ]);
  assert.equal(result.reason, "invalid-range");
});

test("force targets override path detection", () => {
  const result = detectTargetsForPaths(["README.md"], { forceTargets: "keyboard-app,web-app" });
  assert.deepEqual(result.targets, ["web-app", "keyboard-app"]);
  assert.deepEqual(
    result.jobs.map((job) => job.name),
    ["playsay-platform-develop", "playsay-keyboard-frontend-develop"],
  );
  assert.equal(result.reason, "forced");
});
