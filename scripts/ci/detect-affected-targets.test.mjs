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

test("web-app changes trigger only web-app job", () => {
  assertDetection(["frontend/web-app/src/App.tsx"], ["web-app"], ["playsay-web-app-develop"]);
});

test("api-gateway and contract changes trigger api-gateway and web-app", () => {
  assertDetection(
    ["backend/api-gateway/src/main/kotlin/com/playsay/gateway/GatewayController.kt", "contracts/openapi.yaml"],
    ["api-gateway", "web-app"],
    ["playsay-api-gateway-develop", "playsay-web-app-develop"],
  );
});

test("ai tutor backend and contract changes trigger ai tutor and web-app", () => {
  assertDetection(
    ["backend/ai-tutor-service/src/main/kotlin/com/playsay/aitutor/AiTutorServiceApplication.kt", "contracts/ai-tutor-openapi.yaml"],
    ["ai-tutor-service", "web-app"],
    ["playsay-ai-tutor-service-develop", "playsay-web-app-develop"],
  );
});

test("registration contract changes trigger registration-service and web-app", () => {
  assertDetection(
    ["contracts/registration-openapi.yaml"],
    ["web-app", "registration-service"],
    ["playsay-web-app-develop", "playsay-registration-service-develop"],
  );
});

test("media-service changes trigger only media-service job", () => {
  assertDetection(
    ["backend/media-service/src/main/kotlin/com/playsay/media/MediaController.kt"],
    ["media-service"],
    ["playsay-media-service-develop"],
  );
});

test("payment-service changes trigger only payment-service job", () => {
  assertDetection(
    ["backend/payment-service/src/main/kotlin/com/playsay/payment/PaymentController.kt"],
    ["payment-service"],
    ["playsay-payment-service-develop"],
  );
});

test("registration-service changes trigger only registration-service job", () => {
  assertDetection(
    ["backend/registration-service/src/main/kotlin/com/playsay/registration/controller/RegistrationController.kt"],
    ["registration-service"],
    ["playsay-registration-service-develop"],
  );
});

test("email-service changes trigger only email-service job", () => {
  assertDetection(
    ["backend/email-service/src/main/kotlin/com/playsay/email/controller/EmailInternalController.kt"],
    ["email-service"],
    ["playsay-email-service-develop"],
  );
});

test("collaboration-service changes trigger only collaboration-service job", () => {
  assertDetection(
    ["collaboration-service/src/server.ts"],
    ["collaboration-service"],
    ["playsay-collaboration-service-develop"],
  );
});

test("shared backend changes trigger all backend targets including keyboard backend", () => {
  assertDetection(
    ["backend/shared-kotlin/src/main/kotlin/com/playsay/shared/Clock.kt"],
    ["api-gateway", "ai-tutor-service", "media-service", "payment-service", "registration-service", "email-service", "keyboard-service"],
    [
      "playsay-api-gateway-develop",
      "playsay-ai-tutor-service-develop",
      "playsay-media-service-develop",
      "playsay-payment-service-develop",
      "playsay-registration-service-develop",
      "playsay-email-service-develop",
      "playsay-keyboard-backend-develop",
    ],
  );
});

test("shared frontend lockfile changes trigger web-app and keyboard frontend", () => {
  assertDetection(
    ["frontend/package-lock.json"],
    ["web-app", "keyboard-app"],
    ["playsay-web-app-develop", "playsay-keyboard-frontend-develop"],
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
    "ai-tutor-service",
    "web-app",
    "collaboration-service",
    "media-service",
    "payment-service",
    "registration-service",
    "email-service",
    "keyboard-service",
    "keyboard-app",
  ]);
  assert.deepEqual(
    result.jobs.map((job) => job.name),
    [
      "playsay-api-gateway-develop",
      "playsay-ai-tutor-service-develop",
      "playsay-web-app-develop",
      "playsay-collaboration-service-develop",
      "playsay-media-service-develop",
      "playsay-payment-service-develop",
      "playsay-registration-service-develop",
      "playsay-email-service-develop",
      "playsay-keyboard-backend-develop",
      "playsay-keyboard-frontend-develop",
    ],
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
    "ai-tutor-service",
    "web-app",
    "collaboration-service",
    "media-service",
    "payment-service",
    "registration-service",
    "email-service",
    "keyboard-service",
    "keyboard-app",
  ]);
  assert.deepEqual(
    result.jobs.map((job) => job.name),
    [
      "playsay-api-gateway-develop",
      "playsay-ai-tutor-service-develop",
      "playsay-web-app-develop",
      "playsay-collaboration-service-develop",
      "playsay-media-service-develop",
      "playsay-payment-service-develop",
      "playsay-registration-service-develop",
      "playsay-email-service-develop",
      "playsay-keyboard-backend-develop",
      "playsay-keyboard-frontend-develop",
    ],
  );
  assert.equal(result.reason, "invalid-range");
});

test("force targets override path detection", () => {
  const result = detectTargetsForPaths(["README.md"], { forceTargets: "keyboard-app,web-app" });
  assert.deepEqual(result.targets, ["web-app", "keyboard-app"]);
  assert.deepEqual(
    result.jobs.map((job) => job.name),
    ["playsay-web-app-develop", "playsay-keyboard-frontend-develop"],
  );
  assert.equal(result.reason, "forced");
});
