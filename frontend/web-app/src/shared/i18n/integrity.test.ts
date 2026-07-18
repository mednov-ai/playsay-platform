import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resources } from "./resources";

type TranslationTree = Record<string, unknown>;

const translations = Object.fromEntries(
  Object.entries(resources).map(([language, resource]) => [language, resource.translation as TranslationTree]),
);

describe("web-app i18n integrity", () => {
  it("keeps the ru, en, de and fr resource structures aligned", () => {
    const expected = normalizedLeafKeys(translations.ru);

    Object.entries(translations).forEach(([language, resource]) => {
      expect(normalizedLeafKeys(resource), language).toEqual(expected);
    });
  });

  it("defines every literal t() and i18n.t() key in every locale", () => {
    const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
    const keys = literalTranslationKeys(sourceRoot);

    Object.entries(translations).forEach(([language, resource]) => {
      keys.forEach((key) => expect(hasTranslation(resource, key), `${language}: ${key}`).toBe(true));
    });
  });

  it("covers dynamic key families derived from UI unions and enums", () => {
    const dynamicKeys = [
      ...keys("shell.theme", ["system", "light", "dark"]),
      ...keys("schedule.weekdaysShort", ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]),
      ...keys("schedule.wizard.steps", ["students", "time", "material", "review"]),
      ...keys("payments.status", ["OPEN", "PAYMENT_PENDING", "PAID", "EXPIRED", "CANCELED", "REFUNDED"]),
      ...keys("userManagement.roles", ["STUDENT", "TEACHER", "ADMIN", "ADMIN_TEACHER"]),
      ...keys("userManagement.status", ["ACTIVE", "DELETED", "FUTURE", "EXPIRED", "REVOKED"]),
      ...keys("aiTutor.age", ["CHILD", "TEEN", "ADULT"]),
      ...keys("aiTutor.feedback", ["EVERY_TURN", "SIGNIFICANT", "SESSION_END"]),
      ...keys("aiTutor.feedbackShort", ["EVERY_TURN", "SIGNIFICANT", "SESSION_END"]),
      ...keys("classroom.annotation.element", ["stroke", "line", "arrow", "rectangle", "ellipse", "text", "stickyNote", "mindMapNode"]),
      ...keys("classroom.preJoin.warning", ["microphone", "speaker", "camera"]),
      ...keys("classroom.health", ["clear", "watch", "warm", "hot"]),
      ...["start", "check-email", "confirm", "forgot-password", "reset-password"].flatMap((route) => [
        `registration.${route}.title`,
        `registration.${route}.subtitle`,
      ]),
      ...keys("registration.password", ["tooShort", "tooLong", "tooCommon", "containsEmail", "containsName", "needsVariety"]),
    ];

    Object.entries(translations).forEach(([language, resource]) => {
      dynamicKeys.forEach((key) => expect(hasTranslation(resource, key), `${language}: ${key}`).toBe(true));
    });
  });

  it("does not leak Cyrillic into en, de or fr UI resources", () => {
    ["en", "de", "fr"].forEach((language) => {
      const text = translationStrings(translations[language]).join("\n").split("Русский").join("");
      expect(text, language).not.toMatch(/[А-Яа-яЁё]/u);
    });
  });
});

function keys(prefix: string, values: readonly string[]): string[] {
  return values.map((value) => `${prefix}.${value}`);
}

function normalizedLeafKeys(resource: TranslationTree): string[] {
  return [...new Set([...collectLeafKeys(resource)].map(normalizePluralKey))].sort();
}

function collectLeafKeys(value: unknown, prefix = "", result = new Set<string>()): Set<string> {
  if (Array.isArray(value) || typeof value !== "object" || value === null) {
    if (prefix) result.add(prefix);
    return result;
  }
  Object.entries(value).forEach(([key, child]) => collectLeafKeys(child, prefix ? `${prefix}.${key}` : key, result));
  return result;
}

function normalizePluralKey(key: string): string {
  return key.replace(/_(zero|one|two|few|many|other)$/u, "");
}

function translationStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(translationStrings);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(translationStrings);
  return [];
}

function hasTranslation(resource: TranslationTree, key: string): boolean {
  const value = key.split(".").reduce<unknown>((current, part) => {
    if (typeof current !== "object" || current === null || !(part in current)) return undefined;
    return (current as TranslationTree)[part];
  }, resource);
  if (value !== undefined) return true;
  return [...collectLeafKeys(resource)].some((candidate) => normalizePluralKey(candidate) === key);
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
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/u.test(entry.name) && !/\.test\./u.test(entry.name) ? [path] : [];
  });
}
