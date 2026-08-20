import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  DetectionError,
  detectTargetsForPaths,
  detectTargetsFromGitRange,
} from "./detect-affected-targets.mjs";

function assertDetection(paths, expectedTargets, expectedJobs, expectedValidations = [], options = {}) {
  const result = detectTargetsForPaths(paths, options);
  assert.deepEqual(result.deployTargets, expectedTargets);
  assert.deepEqual(
    result.downstreamJobs.map((job) => job.name),
    expectedJobs,
  );
  assert.deepEqual(result.validationSuites, expectedValidations);
  assert.deepEqual(result.targets, result.deployTargets);
  assert.deepEqual(result.jobs, result.downstreamJobs);
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

test("module source changes trigger only their deploy target", () => {
  assertDetection(
    ["backend/ai-tutor-service/src/main/kotlin/com/playsay/aitutor/AiTutorServiceApplication.kt"],
    ["ai-tutor-service"],
    ["playsay-ai-tutor-service-develop"],
  );
  assertDetection(
    ["backend/vocabulary-service/src/main/kotlin/com/playsay/vocabulary/VocabularyService.kt"],
    ["vocabulary-service"],
    ["playsay-vocabulary-service-develop"],
  );
  assertDetection(
    ["backend/registration-service/src/main/kotlin/com/playsay/registration/RegistrationService.kt"],
    ["registration-service"],
    ["playsay-registration-service-develop"],
  );
  assertDetection(
    ["collaboration-service/src/server.ts"],
    ["collaboration-service"],
    ["playsay-collaboration-service-develop"],
  );
  assertDetection(
    ["frontend/game-adapter-service/src/server.ts"],
    ["game-adapter-service"],
    ["playsay-game-adapter-service-develop"],
  );
});

test("module Jenkinsfiles trigger only the corresponding module", () => {
  assertDetection(
    ["Jenkinsfile.api-gateway"],
    ["api-gateway"],
    ["playsay-api-gateway-develop"],
  );
  assertDetection(
    ["Jenkinsfile.keyboard-frontend"],
    ["keyboard-app"],
    ["playsay-keyboard-frontend-develop"],
  );
  assertDetection(
    ["Jenkinsfile.game-adapter-service"],
    ["game-adapter-service"],
    ["playsay-game-adapter-service-develop"],
  );
});

test("contracts trigger their producers and frontend consumers", () => {
  assertDetection(
    ["contracts/openapi.yaml"],
    ["api-gateway", "web-app"],
    ["playsay-api-gateway-develop", "playsay-web-app-develop"],
  );
  assertDetection(
    ["contracts/ai-tutor-openapi.yaml"],
    ["ai-tutor-service", "web-app"],
    ["playsay-ai-tutor-service-develop", "playsay-web-app-develop"],
  );
  assertDetection(
    ["contracts/vocabulary-openapi.yaml"],
    ["vocabulary-service", "web-app", "keyboard-app"],
    [
      "playsay-vocabulary-service-develop",
      "playsay-web-app-develop",
      "playsay-keyboard-frontend-develop",
    ],
  );
  assertDetection(
    ["contracts/keyboard-openapi.yaml"],
    ["vocabulary-service", "keyboard-service", "keyboard-app"],
    [
      "playsay-vocabulary-service-develop",
      "playsay-keyboard-backend-develop",
      "playsay-keyboard-frontend-develop",
    ],
  );
  assertDetection(
    ["contracts/websocket-messages.schema.json"],
    ["vocabulary-service", "web-app", "keyboard-app"],
    [
      "playsay-vocabulary-service-develop",
      "playsay-web-app-develop",
      "playsay-keyboard-frontend-develop",
    ],
  );
  assertDetection(
    ["contracts/registration-openapi.yaml"],
    ["web-app", "registration-service"],
    ["playsay-web-app-develop", "playsay-registration-service-develop"],
  );
});

test("frontend and browser extension changes stay scoped", () => {
  assertDetection(
    ["frontend/web-app/src/App.tsx", "frontend/browser-extension/src/protocol.ts"],
    ["web-app"],
    ["playsay-web-app-develop"],
  );
  assertDetection(
    ["frontend/keyboard-app/src/App.tsx"],
    ["keyboard-app"],
    ["playsay-keyboard-frontend-develop"],
  );
  assertDetection(
    ["frontend/game-sync-sdk/src/runtime.ts"],
    ["web-app", "game-adapter-service"],
    ["playsay-web-app-develop", "playsay-game-adapter-service-develop"],
  );
});

test("shared backend and frontend changes use explicit consumer sets", () => {
  assertDetection(
    ["backend/shared-kotlin/src/main/kotlin/com/playsay/shared/Clock.kt"],
    [
      "api-gateway",
      "ai-tutor-service",
      "vocabulary-service",
      "media-service",
      "payment-service",
      "registration-service",
      "email-service",
      "keyboard-service",
    ],
    [
      "playsay-api-gateway-develop",
      "playsay-ai-tutor-service-develop",
      "playsay-vocabulary-service-develop",
      "playsay-media-service-develop",
      "playsay-payment-service-develop",
      "playsay-registration-service-develop",
      "playsay-email-service-develop",
      "playsay-keyboard-backend-develop",
    ],
  );
  for (const sharedBackendPath of [
    "backend/architecture-testkit/src/main/kotlin/com/playsay/architecture/Rules.kt",
    "backend/build-logic/src/main/kotlin/playsay.spring-service-conventions.gradle.kts",
    "backend/config/detekt/detekt.yml",
  ]) {
    assertDetection(
      [sharedBackendPath],
      [
        "api-gateway",
        "ai-tutor-service",
        "vocabulary-service",
        "media-service",
        "payment-service",
        "registration-service",
        "email-service",
        "keyboard-service",
      ],
      [
        "playsay-api-gateway-develop",
        "playsay-ai-tutor-service-develop",
        "playsay-vocabulary-service-develop",
        "playsay-media-service-develop",
        "playsay-payment-service-develop",
        "playsay-registration-service-develop",
        "playsay-email-service-develop",
        "playsay-keyboard-backend-develop",
      ],
    );
  }
  assertDetection(
    ["frontend/package-lock.json", "frontend/.dockerignore"],
    ["web-app", "game-adapter-service", "keyboard-app"],
    [
      "playsay-web-app-develop",
      "playsay-game-adapter-service-develop",
      "playsay-keyboard-frontend-develop",
    ],
  );
});

test("CI-only and smoke-only changes run validations without product images", () => {
  const ciOnly = detectTargetsForPaths(["Jenkinsfile.dispatcher", "scripts/ci/update-environment-image.sh"]);
  assert.deepEqual(ciOnly.deployTargets, []);
  assert.deepEqual(ciOnly.downstreamJobs, []);
  assert.deepEqual(ciOnly.validationSuites, ["ci-contracts"]);
  assert.equal(ciOnly.reason, "validation-only");

  const smokeOnly = detectTargetsForPaths(["scripts/smoke/sprint5-ui-smoke.mjs"]);
  assert.deepEqual(smokeOnly.deployTargets, []);
  assert.deepEqual(smokeOnly.validationSuites, ["smoke-syntax"]);
  assert.equal(smokeOnly.reason, "validation-only");

  const webAndSmoke = detectTargetsForPaths([
    "frontend/web-app/src/app.css",
    "scripts/smoke/sprint5-ui-smoke.mjs",
  ]);
  assert.deepEqual(webAndSmoke.deployTargets, ["web-app"]);
  assert.deepEqual(webAndSmoke.validationSuites, ["smoke-syntax"]);
  assert.equal(webAndSmoke.reason, "paths-and-validation");
});

test("docs-only changes do not trigger downstream work", () => {
  const result = detectTargetsForPaths(["README.md", "docs/dev-setup.md", "backend/api-gateway/README.md"]);
  assert.deepEqual(result.deployTargets, []);
  assert.deepEqual(result.downstreamJobs, []);
  assert.deepEqual(result.validationSuites, []);
  assert.equal(result.reason, "docs-only");
});

test("unmapped source paths stop detection instead of rebuilding everything", () => {
  assert.throws(
    () => detectTargetsForPaths(["new-tooling/config.yml"]),
    (error) => {
      assert.ok(error instanceof DetectionError);
      assert.match(error.message, /Unmapped changed path/);
      assert.deepEqual(error.metadata.unmappedFiles, ["new-tooling/config.yml"]);
      return true;
    },
  );
});

test("invalid and force-pushed Git ranges stop before downstream jobs", () => {
  assert.throws(
    () =>
      detectTargetsFromGitRange({
        before: "0000000000000000000000000000000000000000",
        after: "1111111111111111111111111111111111111111",
        branch: "develop",
      }),
    /Invalid or unavailable GITHUB_AFTER/,
  );
});

test("first numeric release uses a divergent current-production baseline", () => {
  const repo = mkdtempSync(resolve(tmpdir(), "playsay-detector-release-"));
  const originalCwd = process.cwd();
  try {
    git(repo, ["init", "-q"]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "Test"]);
    execFileSync("mkdir", ["-p", resolve(repo, "frontend/web-app/src")]);
    writeFileSync(resolve(repo, "frontend/web-app/src/App.tsx"), "base\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-qm", "base"]);
    const base = git(repo, ["rev-parse", "HEAD"]);

    git(repo, ["switch", "--orphan", "release-candidate"]);
    execFileSync("mkdir", ["-p", resolve(repo, "frontend/web-app/src")]);
    writeFileSync(resolve(repo, "frontend/web-app/src/App.tsx"), "candidate\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-qm", "candidate"]);
    const after = git(repo, ["rev-parse", "HEAD"]);

    process.chdir(repo);
    const result = detectTargetsFromGitRange({
      before: "0".repeat(40),
      after,
      branch: "release/1.001.07",
      releaseBaseCommit: base,
      releaseBaseBranch: "release/1.001.06",
    });

    assert.deepEqual(result.deployTargets, ["web-app"]);
    assert.equal(result.detectionMode, "current-prod-baseline");
    assert.equal(result.baseCommit, base);
    assert.equal(result.headCommit, after);
    assert.equal(result.baseReleaseBranch, "release/1.001.06");
  } finally {
    process.chdir(originalCwd);
    rmSync(repo, { recursive: true, force: true });
  }
});

test("force targets remain an explicit operator override", () => {
  const result = detectTargetsForPaths(["README.md"], {
    forceTargets: "keyboard-app,web-app",
    baseCommit: "a".repeat(40),
    headCommit: "b".repeat(40),
  });
  assert.deepEqual(result.deployTargets, ["web-app", "keyboard-app"]);
  assert.deepEqual(
    result.downstreamJobs.map((job) => job.name),
    ["playsay-web-app-develop", "playsay-keyboard-frontend-develop"],
  );
  assert.equal(result.detectionMode, "forced");
  assert.equal(result.reason, "forced");
});

test("historical coarse cases now produce granular work", () => {
  const smokeOnly = detectTargetsForPaths(["scripts/smoke/sprint5-ui-smoke.mjs"]);
  assert.deepEqual(smokeOnly.deployTargets, []);

  const webAndSmoke = detectTargetsForPaths([
    "frontend/web-app/src/index.css",
    "scripts/smoke/sprint5-ui-smoke.mjs",
  ]);
  assert.deepEqual(webAndSmoke.deployTargets, ["web-app"]);

  const apiWebAndCi = detectTargetsForPaths([
    "backend/api-gateway/src/main/kotlin/com/playsay/gateway/GatewayController.kt",
    "frontend/web-app/src/App.tsx",
    "scripts/ci/deployment-routing.test.mjs",
  ]);
  assert.deepEqual(apiWebAndCi.deployTargets, ["api-gateway", "web-app"]);
  assert.deepEqual(apiWebAndCi.validationSuites, ["ci-contracts"]);
});
