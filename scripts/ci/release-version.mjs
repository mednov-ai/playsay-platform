#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const NEW_RELEASE_BRANCH_PATTERN = /^release\/[0-9]{2}\.[0-9]{3}\.[0-9]{2}$/;
const BASE_RELEASE_PATTERN = /^(?:release\/)?([0-9]{1,2})\.([0-9]{3})\.([0-9]{2})$/;

export function parseReleaseVersion(value) {
  const match = BASE_RELEASE_PATTERN.exec(String(value).trim());
  if (!match) {
    throw new Error(`Invalid release version: ${value}. Expected release/NN.NNN.NN.`);
  }
  const major = Number(match[1]);
  const release = Number(match[2]);
  const fix = Number(match[3]);
  if (major < 1 || release < 1) {
    throw new Error("Major and release counters must start at 1.");
  }
  return { major, release, fix };
}

export function formatReleaseVersion({ major, release, fix }) {
  if (major > 99 || release > 999 || fix > 99) {
    throw new Error("Release counter exceeds the NN.NNN.NN format.");
  }
  return `release/${String(major).padStart(2, "0")}.${String(release).padStart(3, "0")}.${String(fix).padStart(2, "0")}`;
}

export function nextReleaseVersion(current, type) {
  const version = parseReleaseVersion(current);
  switch (type) {
    case "major":
      if (version.major === 99) throw new Error("Major counter is already 99.");
      return formatReleaseVersion({ major: version.major + 1, release: 1, fix: 0 });
    case "release":
      if (version.release === 999) throw new Error("Release counter is already 999; choose a major release.");
      return formatReleaseVersion({ major: version.major, release: version.release + 1, fix: 0 });
    case "fix":
      if (version.fix === 99) throw new Error("Fix counter is already 99; choose a regular release.");
      return formatReleaseVersion({ major: version.major, release: version.release, fix: version.fix + 1 });
    default:
      throw new Error(`Unknown release type: ${type}. Expected major, release, or fix.`);
  }
}

function main() {
  const [current, type] = process.argv.slice(2);
  if (!current || !type) {
    console.error("Usage: node scripts/ci/release-version.mjs <current-release> <major|release|fix>");
    process.exit(2);
  }
  try {
    console.log(nextReleaseVersion(current, type));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
