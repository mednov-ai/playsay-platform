import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resources } from "./resources";

type TranslationTree = Record<string, unknown>;

const translations = Object.fromEntries(
  Object.entries(resources).map(([language, resource]) => [language, resource.translation as TranslationTree]),
);

describe("keyboard-app i18n integrity", () => {
  it("keeps all locale resource structures aligned", () => {
    const expected = leafKeys(translations.ru);
    Object.entries(translations).forEach(([language, resource]) => expect(leafKeys(resource), language).toEqual(expected));
  });

  it("defines every literal translation key in every locale", () => {
    const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
    const literalKeys = literalTranslationKeys(sourceRoot);
    Object.entries(translations).forEach(([language, resource]) => {
      literalKeys.forEach((key) => expect(hasTranslation(resource, key), `${language}: ${key}`).toBe(true));
    });
  });

  it("covers dynamic trainer key families", () => {
    const dynamicKeys = [
      ...keys("language", ["ru", "en", "de", "fr"]),
      ...keys("masteryLevel", ["starter", "beginner", "confident", "middle", "strong", "pro"]),
      ...keys("trainer", ["codeDifficulty_trigrams", "codeDifficulty_quadgrams", "codeDifficulty_long"]),
      ...keys("techniqueAdvice", ["problemChord", "problemChar", "rhythm", "accuracy", "accuracyTrend", "speed", "steady"]),
      ...keys("finger", ["leftPinky", "leftRing", "leftMiddle", "leftIndex", "rightIndex", "rightMiddle", "rightRing", "rightPinky"]),
    ];
    Object.entries(translations).forEach(([language, resource]) => {
      dynamicKeys.forEach((key) => expect(hasTranslation(resource, key), `${language}: ${key}`).toBe(true));
    });
  });

  it("allows Cyrillic outside Russian only for the native language name", () => {
    ["en", "de", "fr"].forEach((language) => {
      const text = strings(translations[language]).join("\n").split("Русский").join("");
      expect(text, language).not.toMatch(/[А-Яа-яЁё]/u);
    });
  });
});

function keys(prefix: string, values: readonly string[]): string[] {
  return values.map((value) => `${prefix}.${value}`);
}

function leafKeys(value: unknown, prefix = "", result = new Set<string>()): string[] {
  if (Array.isArray(value) || typeof value !== "object" || value === null) {
    if (prefix) result.add(prefix);
    return [...result].sort();
  }
  Object.entries(value).forEach(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key, result));
  return [...result].sort();
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

function hasTranslation(resource: TranslationTree, key: string): boolean {
  return key.split(".").reduce<unknown>((current, part) => {
    if (typeof current !== "object" || current === null || !(part in current)) return undefined;
    return (current as TranslationTree)[part];
  }, resource) !== undefined;
}

function literalTranslationKeys(root: string): Set<string> {
  const result = new Set<string>();
  sourceFiles(root).forEach((file) => {
    const source = readFileSync(file, "utf8");
    const calls = /(?:\bi18n\.t|\bt)\(\s*(["'])([^"']+)\1/gu;
    for (const match of source.matchAll(calls)) result.add(match[2]);
  });
  return result;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/u.test(entry.name) && !/\.test\./u.test(entry.name) ? [path] : [];
  });
}
