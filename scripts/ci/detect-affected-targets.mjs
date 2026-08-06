#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const TARGETS = Object.freeze([
  "api-gateway",
  "ai-tutor-service",
  "vocabulary-service",
  "web-app",
  "game-adapter-service",
  "collaboration-service",
  "media-service",
  "payment-service",
  "registration-service",
  "email-service",
  "keyboard-service",
  "keyboard-app",
]);

export const VALIDATION_SUITES = Object.freeze(["ci-contracts", "smoke-syntax"]);

const NUMERIC_RELEASE_PATTERN = /^release\/[0-9]+\.[0-9]+\.[0-9]+$/;
const ZERO_COMMIT_PATTERN = /^0{40}$/;
const ALL_TARGETS = new Set(TARGETS);
const BACKEND_TARGETS = new Set([
  "api-gateway",
  "ai-tutor-service",
  "vocabulary-service",
  "media-service",
  "payment-service",
  "registration-service",
  "email-service",
  "keyboard-service",
]);
const FRONTEND_TARGETS = new Set(["web-app", "game-adapter-service", "keyboard-app"]);
const TARGET_JOBS = Object.freeze({
  "api-gateway": "playsay-api-gateway-develop",
  "ai-tutor-service": "playsay-ai-tutor-service-develop",
  "vocabulary-service": "playsay-vocabulary-service-develop",
  "web-app": "playsay-web-app-develop",
  "game-adapter-service": "playsay-game-adapter-service-develop",
  "collaboration-service": "playsay-collaboration-service-develop",
  "media-service": "playsay-media-service-develop",
  "payment-service": "playsay-payment-service-develop",
  "registration-service": "playsay-registration-service-develop",
  "email-service": "playsay-email-service-develop",
  "keyboard-service": "playsay-keyboard-backend-develop",
  "keyboard-app": "playsay-keyboard-frontend-develop",
});
const MODULE_PIPELINES = Object.freeze({
  "Jenkinsfile.api-gateway": "api-gateway",
  "Jenkinsfile.ai-tutor-service": "ai-tutor-service",
  "Jenkinsfile.vocabulary-service": "vocabulary-service",
  "Jenkinsfile.web-app": "web-app",
  "Jenkinsfile.game-adapter-service": "game-adapter-service",
  "Jenkinsfile.collaboration-service": "collaboration-service",
  "Jenkinsfile.media-service": "media-service",
  "Jenkinsfile.payment-service": "payment-service",
  "Jenkinsfile.registration-service": "registration-service",
  "Jenkinsfile.email-service": "email-service",
  "Jenkinsfile.keyboard-backend": "keyboard-service",
  "Jenkinsfile.keyboard-frontend": "keyboard-app",
});

export class DetectionError extends Error {
  constructor(message, metadata = {}) {
    super(message);
    this.name = "DetectionError";
    this.metadata = metadata;
  }
}

function addAll(targets, source) {
  for (const target of source) {
    targets.add(target);
  }
}

function addValidation(validationSuites, suite) {
  if (!VALIDATION_SUITES.includes(suite)) {
    throw new DetectionError(`Unknown validation suite: ${suite}`);
  }
  validationSuites.add(suite);
}

export function parseTargetList(value) {
  if (!value || value.trim() === "") {
    return null;
  }
  const rawTargets = value
    .split(",")
    .map((target) => target.trim())
    .filter(Boolean);
  if (rawTargets.includes("all")) {
    return new Set(ALL_TARGETS);
  }
  const unknown = rawTargets.filter((target) => !ALL_TARGETS.has(target));
  if (unknown.length > 0) {
    throw new DetectionError(`Unknown FORCE_TARGETS value(s): ${unknown.join(", ")}`);
  }
  return new Set(rawTargets);
}

function isDocsOnlyPath(path) {
  return (
    path === "README.md" ||
    path === "AGENTS.md" ||
    path === "keyboard.md" ||
    path.endsWith(".md") ||
    path.startsWith("docs/") ||
    path.startsWith("specs/")
  );
}

function isSharedBackendPath(path) {
  return (
    path === "backend/build.gradle.kts" ||
    path === "backend/settings.gradle.kts" ||
    path === "backend/gradle.properties" ||
    path === "backend/.dockerignore" ||
    path.startsWith("backend/shared-kotlin/") ||
    path.startsWith("backend/gradle/") ||
    path.startsWith("backend/buildSrc/")
  );
}

function isSharedFrontendPath(path) {
  return (
    path === "frontend/package.json" ||
    path === "frontend/package-lock.json" ||
    path === "frontend/.dockerignore" ||
    path === "frontend/.npmrc" ||
    path.startsWith("frontend/scripts/") ||
    path.startsWith("frontend/config/")
  );
}

export function detectTargetsForPaths(paths, options = {}) {
  const forcedTargets = parseTargetList(options.forceTargets ?? "");
  if (forcedTargets) {
    return buildDetectionResult(forcedTargets, new Set(), {
      reason: "forced",
      detectionMode: "forced",
      baseCommit: options.baseCommit ?? "",
      headCommit: options.headCommit ?? "",
      baseReleaseBranch: options.baseReleaseBranch ?? "",
      changedFiles: paths,
      unmappedFiles: [],
    });
  }

  const deployTargets = new Set();
  const validationSuites = new Set();
  const unmappedFiles = [];

  for (const path of paths) {
    if (!path || isDocsOnlyPath(path)) {
      continue;
    }

    if (MODULE_PIPELINES[path]) {
      deployTargets.add(MODULE_PIPELINES[path]);
      continue;
    }

    if (path === "Jenkinsfile" || path === "Jenkinsfile.dispatcher" || path.startsWith(".github/")) {
      addValidation(validationSuites, "ci-contracts");
      continue;
    }

    if (path.startsWith("scripts/ci/")) {
      addValidation(validationSuites, "ci-contracts");
      if (path === "scripts/ci/run-ui-smoke.sh") {
        addValidation(validationSuites, "smoke-syntax");
      }
      continue;
    }

    if (path.startsWith("scripts/smoke/")) {
      addValidation(validationSuites, "smoke-syntax");
      continue;
    }

    if (path === "contracts/openapi.yaml") {
      deployTargets.add("api-gateway");
      deployTargets.add("web-app");
      continue;
    }

    if (path === "contracts/ai-tutor-openapi.yaml") {
      deployTargets.add("ai-tutor-service");
      deployTargets.add("web-app");
      continue;
    }

    if (path === "contracts/vocabulary-openapi.yaml") {
      deployTargets.add("vocabulary-service");
      deployTargets.add("web-app");
      deployTargets.add("keyboard-app");
      continue;
    }

    if (path === "contracts/websocket-messages.schema.json") {
      deployTargets.add("vocabulary-service");
      deployTargets.add("web-app");
      deployTargets.add("keyboard-app");
      continue;
    }

    if (path === "contracts/registration-openapi.yaml") {
      deployTargets.add("registration-service");
      deployTargets.add("web-app");
      continue;
    }

    if (path.startsWith("backend/api-gateway/")) {
      deployTargets.add("api-gateway");
      continue;
    }

    if (path.startsWith("backend/ai-tutor-service/")) {
      deployTargets.add("ai-tutor-service");
      continue;
    }

    if (path.startsWith("backend/vocabulary-service/")) {
      deployTargets.add("vocabulary-service");
      continue;
    }

    if (path.startsWith("backend/media-service/")) {
      deployTargets.add("media-service");
      continue;
    }

    if (path.startsWith("backend/payment-service/")) {
      deployTargets.add("payment-service");
      continue;
    }

    if (path.startsWith("backend/registration-service/")) {
      deployTargets.add("registration-service");
      continue;
    }

    if (path.startsWith("backend/email-service/")) {
      deployTargets.add("email-service");
      continue;
    }

    if (path.startsWith("backend/keyboard-service/")) {
      deployTargets.add("keyboard-service");
      continue;
    }

    if (isSharedBackendPath(path)) {
      addAll(deployTargets, BACKEND_TARGETS);
      continue;
    }

    if (path.startsWith("frontend/keyboard-app/")) {
      deployTargets.add("keyboard-app");
      continue;
    }

    if (path.startsWith("frontend/shared-ui/")) {
      deployTargets.add("web-app");
      deployTargets.add("keyboard-app");
      continue;
    }

    if (path.startsWith("frontend/web-app/") || path.startsWith("frontend/browser-extension/")) {
      deployTargets.add("web-app");
      continue;
    }

    if (path.startsWith("frontend/game-adapter-service/")) {
      deployTargets.add("game-adapter-service");
      continue;
    }

    if (path.startsWith("frontend/game-sync-sdk/")) {
      deployTargets.add("web-app");
      deployTargets.add("game-adapter-service");
      continue;
    }

    if (isSharedFrontendPath(path)) {
      addAll(deployTargets, FRONTEND_TARGETS);
      continue;
    }

    if (path.startsWith("collaboration-service/")) {
      deployTargets.add("collaboration-service");
      continue;
    }

    unmappedFiles.push(path);
  }

  if (unmappedFiles.length > 0) {
    throw new DetectionError(
      `Unmapped changed path(s): ${unmappedFiles.join(", ")}. Add an explicit routing rule or retry with FORCE_TARGETS.`,
      { changedFiles: paths, unmappedFiles },
    );
  }

  let reason = "paths";
  if (deployTargets.size === 0 && validationSuites.size === 0) {
    reason = "docs-only";
  } else if (deployTargets.size === 0) {
    reason = "validation-only";
  } else if (validationSuites.size > 0) {
    reason = "paths-and-validation";
  }

  return buildDetectionResult(deployTargets, validationSuites, {
    reason,
    detectionMode: options.detectionMode ?? "webhook-range",
    baseCommit: options.baseCommit ?? "",
    headCommit: options.headCommit ?? "",
    baseReleaseBranch: options.baseReleaseBranch ?? "",
    changedFiles: paths,
    unmappedFiles,
  });
}

export function buildDetectionResult(deployTargets, validationSuites = new Set(), metadata = {}) {
  const targetList = TARGETS.filter((target) => deployTargets.has(target));
  const jobs = targetList.map((target) => ({
    name: TARGET_JOBS[target],
    targets: [target],
    parameters: {},
  }));
  const suiteList = VALIDATION_SUITES.filter((suite) => validationSuites.has(suite));

  return {
    deployTargets: targetList,
    downstreamJobs: jobs,
    validationSuites: suiteList,
    detectionMode: metadata.detectionMode ?? "webhook-range",
    baseCommit: metadata.baseCommit ?? "",
    headCommit: metadata.headCommit ?? "",
    baseReleaseBranch: metadata.baseReleaseBranch ?? "",
    changedFiles: metadata.changedFiles ?? [],
    unmappedFiles: metadata.unmappedFiles ?? [],
    reason: metadata.reason ?? "paths",
    // Compatibility aliases for local tools that consumed the first detector contract.
    targets: targetList,
    jobs,
    unknownFiles: metadata.unmappedFiles ?? [],
  };
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function isZeroCommit(commit) {
  return ZERO_COMMIT_PATTERN.test(commit);
}

function isCommitSha(commit) {
  return /^[0-9a-f]{40}$/.test(commit);
}

function gitObjectExists(commit) {
  try {
    git(["cat-file", "-e", `${commit}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function isAncestor(before, after) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", before, after], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function resolveCurrentProductionBaseline({ infraRepo, platformRemote = "origin" }) {
  if (!infraRepo) {
    throw new DetectionError("INFRA_REPO is required to resolve the current production release baseline.");
  }

  const workDir = mkdtempSync(resolve(tmpdir(), "playsay-release-baseline-"));
  const infraDir = resolve(workDir, "infra");
  try {
    git(["clone", "--quiet", "--depth", "1", "--single-branch", "--branch", "develop", infraRepo, infraDir]);
    const releaseBranch = readFileSync(resolve(infraDir, "argocd-apps/prod/current-release.txt"), "utf8").trim();
    if (!NUMERIC_RELEASE_PATTERN.test(releaseBranch)) {
      throw new DetectionError(`Invalid current production release in infra develop: ${releaseBranch}`);
    }
    git(["fetch", "--quiet", "--no-tags", platformRemote, `+refs/heads/${releaseBranch}:refs/remotes/${platformRemote}/${releaseBranch}`]);
    const commit = git(["rev-parse", `refs/remotes/${platformRemote}/${releaseBranch}^{commit}`]);
    if (!isCommitSha(commit)) {
      throw new DetectionError(`Could not resolve platform baseline for ${releaseBranch}.`);
    }
    return { releaseBranch, commit };
  } catch (error) {
    if (error instanceof DetectionError) {
      throw error;
    }
    throw new DetectionError(
      `Could not resolve current production baseline: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

export function detectTargetsFromGitRange({
  before,
  after,
  branch = "",
  forceTargets,
  releaseBaseCommit = "",
  releaseBaseBranch = "",
}) {
  if (!isCommitSha(after ?? "") || isZeroCommit(after ?? "") || !gitObjectExists(after)) {
    throw new DetectionError(`Invalid or unavailable GITHUB_AFTER commit: ${after || "(empty)"}`);
  }

  const forcedTargets = parseTargetList(forceTargets ?? "");
  if (forcedTargets) {
    return buildDetectionResult(forcedTargets, new Set(), {
      reason: "forced",
      detectionMode: "forced",
      baseCommit: releaseBaseCommit || before || "",
      headCommit: after,
      baseReleaseBranch: releaseBaseBranch,
      changedFiles: [],
      unmappedFiles: [],
    });
  }

  let baseCommit = before ?? "";
  let detectionMode = "webhook-range";
  if (!baseCommit || isZeroCommit(baseCommit)) {
    if (!NUMERIC_RELEASE_PATTERN.test(branch) || !isCommitSha(releaseBaseCommit)) {
      throw new DetectionError(
        "A zero or missing GITHUB_BEFORE is allowed only for a numeric release with a resolved current-production baseline. Retry with FORCE_TARGETS if the baseline cannot be resolved.",
      );
    }
    baseCommit = releaseBaseCommit;
    detectionMode = "current-prod-baseline";
  }

  if (!isCommitSha(baseCommit) || !gitObjectExists(baseCommit)) {
    throw new DetectionError(`Invalid or unavailable diff base commit: ${baseCommit || "(empty)"}`);
  }
  if (detectionMode === "webhook-range" && !isAncestor(baseCommit, after)) {
    throw new DetectionError(
      `GITHUB_BEFORE ${baseCommit} is not an ancestor of GITHUB_AFTER ${after}. Force-push ranges require an explicit FORCE_TARGETS override.`,
    );
  }

  const changedFiles = git(["diff", "--name-only", "--diff-filter=ACMRTUXBD", baseCommit, after])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return detectTargetsForPaths(changedFiles, {
    detectionMode,
    baseCommit,
    headCommit: after,
    baseReleaseBranch: releaseBaseBranch,
  });
}

function renderEnv(result) {
  return [
    `AFFECTED_TARGETS=${result.deployTargets.join(",")}`,
    `AFFECTED_JOBS=${result.downstreamJobs.map((job) => job.name).join(",")}`,
    `VALIDATION_SUITES=${result.validationSuites.join(",")}`,
    `AFFECTED_REASON=${result.reason}`,
    `DETECTION_MODE=${result.detectionMode}`,
    `DETECTION_BASE=${result.baseCommit}`,
    `DETECTION_HEAD=${result.headCommit}`,
    `BASE_RELEASE_BRANCH=${result.baseReleaseBranch}`,
  ].join("\n");
}

function main() {
  const args = new Set(process.argv.slice(2));
  const format = args.has("--env") ? "env" : "json";
  const branch = process.env.BRANCH_NAME?.trim() ?? "";
  let releaseBaseline = {
    releaseBranch: process.env.BASE_RELEASE_BRANCH?.trim() ?? "",
    commit: process.env.RELEASE_BASE_COMMIT?.trim() ?? "",
  };

  try {
    if (NUMERIC_RELEASE_PATTERN.test(branch) && (!releaseBaseline.releaseBranch || !releaseBaseline.commit)) {
      releaseBaseline = resolveCurrentProductionBaseline({
        infraRepo: process.env.INFRA_REPO,
        platformRemote: "origin",
      });
    }
    const result = detectTargetsFromGitRange({
      before: process.env.GITHUB_BEFORE,
      after: process.env.GITHUB_AFTER,
      branch,
      forceTargets: process.env.FORCE_TARGETS,
      releaseBaseCommit: releaseBaseline.commit,
      releaseBaseBranch: releaseBaseline.releaseBranch,
    });

    if (format === "env") {
      process.stdout.write(`${renderEnv(result)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Affected-target detection failed: ${message}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
