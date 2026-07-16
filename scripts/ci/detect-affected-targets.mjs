#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const TARGETS = Object.freeze([
  "api-gateway",
  "ai-tutor-service",
  "vocabulary-service",
  "web-app",
  "collaboration-service",
  "media-service",
  "payment-service",
  "registration-service",
  "email-service",
  "keyboard-service",
  "keyboard-app",
]);

const KEYBOARD_BACKEND_TARGETS = new Set(["keyboard-service"]);
const KEYBOARD_FRONTEND_TARGETS = new Set(["keyboard-app"]);
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
const FRONTEND_TARGETS = new Set(["web-app", "keyboard-app"]);
const TARGET_JOBS = Object.freeze({
  "api-gateway": "playsay-api-gateway-develop",
  "ai-tutor-service": "playsay-ai-tutor-service-develop",
  "vocabulary-service": "playsay-vocabulary-service-develop",
  "web-app": "playsay-web-app-develop",
  "collaboration-service": "playsay-collaboration-service-develop",
  "media-service": "playsay-media-service-develop",
  "payment-service": "playsay-payment-service-develop",
  "registration-service": "playsay-registration-service-develop",
  "email-service": "playsay-email-service-develop",
  "keyboard-service": "playsay-keyboard-backend-develop",
  "keyboard-app": "playsay-keyboard-frontend-develop",
});

function addAll(targets, source) {
  for (const target of source) {
    targets.add(target);
  }
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
    throw new Error(`Unknown FORCE_TARGETS value(s): ${unknown.join(", ")}`);
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

export function detectTargetsForPaths(paths, options = {}) {
  const forcedTargets = parseTargetList(options.forceTargets ?? "");
  if (forcedTargets) {
    return buildDetectionResult(forcedTargets, {
      reason: "forced",
      changedFiles: paths,
      unknownFiles: [],
    });
  }

  const targets = new Set();
  const unknownFiles = [];

  for (const path of paths) {
    if (!path || isDocsOnlyPath(path)) {
      continue;
    }

    if (path === "Jenkinsfile" || path.startsWith("Jenkinsfile.") || path.startsWith("scripts/ci/")) {
      addAll(targets, ALL_TARGETS);
      continue;
    }

    if (path.startsWith(".github/") || path.startsWith("scripts/smoke/")) {
      addAll(targets, ALL_TARGETS);
      continue;
    }

    if (path === "contracts/openapi.yaml") {
      targets.add("api-gateway");
      targets.add("web-app");
      continue;
    }

    if (path.startsWith("backend/api-gateway/")) {
      targets.add("api-gateway");
      continue;
    }

    if (path === "contracts/ai-tutor-openapi.yaml" || path.startsWith("backend/ai-tutor-service/")) {
      targets.add("ai-tutor-service");
      targets.add("web-app");
      continue;
    }

    if (path === "contracts/vocabulary-openapi.yaml" || path.startsWith("backend/vocabulary-service/")) {
      targets.add("vocabulary-service");
      targets.add("web-app");
      targets.add("keyboard-app");
      continue;
    }

    if (path === "contracts/registration-openapi.yaml") {
      targets.add("registration-service");
      targets.add("web-app");
      continue;
    }

    if (path.startsWith("backend/media-service/")) {
      targets.add("media-service");
      continue;
    }

    if (path.startsWith("backend/payment-service/")) {
      targets.add("payment-service");
      continue;
    }

    if (path.startsWith("backend/registration-service/")) {
      targets.add("registration-service");
      continue;
    }

    if (path.startsWith("backend/email-service/")) {
      targets.add("email-service");
      continue;
    }

    if (path.startsWith("backend/keyboard-service/")) {
      targets.add("keyboard-service");
      continue;
    }

    if (
      path === "backend/build.gradle.kts" ||
      path === "backend/settings.gradle.kts" ||
      path === "backend/gradle.properties" ||
      path === "backend/.dockerignore" ||
      path.startsWith("backend/shared-kotlin/") ||
      path.startsWith("backend/gradle/") ||
      path.startsWith("backend/buildSrc/")
    ) {
      addAll(targets, BACKEND_TARGETS);
      continue;
    }

    if (path.startsWith("frontend/keyboard-app/")) {
      targets.add("keyboard-app");
      continue;
    }

    if (path.startsWith("frontend/web-app/")) {
      targets.add("web-app");
      continue;
    }

    if (
      path === "frontend/package.json" ||
      path === "frontend/package-lock.json" ||
      path === "frontend/.npmrc" ||
      path.startsWith("frontend/scripts/") ||
      path.startsWith("frontend/config/")
    ) {
      addAll(targets, FRONTEND_TARGETS);
      continue;
    }

    if (path.startsWith("collaboration-service/")) {
      targets.add("collaboration-service");
      continue;
    }

    unknownFiles.push(path);
  }

  if (unknownFiles.length > 0) {
    return buildDetectionResult(new Set(ALL_TARGETS), {
      reason: "unknown-path",
      changedFiles: paths,
      unknownFiles,
    });
  }

  return buildDetectionResult(targets, {
    reason: targets.size === 0 ? "docs-only" : "paths",
    changedFiles: paths,
    unknownFiles,
  });
}

export function buildDetectionResult(targets, metadata = {}) {
  const targetList = TARGETS.filter((target) => targets.has(target));
  const jobs = targetList.map((target) => ({
    name: TARGET_JOBS[target],
    targets: [target],
    parameters: {},
  }));

  return {
    targets: targetList,
    jobs,
    reason: metadata.reason ?? "paths",
    changedFiles: metadata.changedFiles ?? [],
    unknownFiles: metadata.unknownFiles ?? [],
  };
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function isZeroCommit(commit) {
  return /^0{40}$/.test(commit);
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

export function detectTargetsFromGitRange({ before, after, forceTargets }) {
  const forcedTargets = parseTargetList(forceTargets ?? "");
  if (forcedTargets) {
    return buildDetectionResult(forcedTargets, {
      reason: "forced",
      changedFiles: [],
      unknownFiles: [],
    });
  }

  if (!before || !after || isZeroCommit(before) || isZeroCommit(after)) {
    return buildDetectionResult(new Set(ALL_TARGETS), {
      reason: "invalid-range",
      changedFiles: [],
      unknownFiles: [],
    });
  }

  if (!gitObjectExists(before) || !gitObjectExists(after) || !isAncestor(before, after)) {
    return buildDetectionResult(new Set(ALL_TARGETS), {
      reason: "invalid-range",
      changedFiles: [],
      unknownFiles: [],
    });
  }

  const changedFiles = git(["diff", "--name-only", "--diff-filter=ACMRTUXBD", before, after])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return detectTargetsForPaths(changedFiles);
}

function renderEnv(result) {
  return [
    `AFFECTED_TARGETS=${result.targets.join(",")}`,
    `AFFECTED_JOBS=${result.jobs.map((job) => job.name).join(",")}`,
    `AFFECTED_REASON=${result.reason}`,
  ].join("\n");
}

function main() {
  const args = new Set(process.argv.slice(2));
  const format = args.has("--env") ? "env" : "json";
  const result = detectTargetsFromGitRange({
    before: process.env.GITHUB_BEFORE,
    after: process.env.GITHUB_AFTER,
    forceTargets: process.env.FORCE_TARGETS,
  });

  if (format === "env") {
    process.stdout.write(`${renderEnv(result)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
