import { describe, expect, it } from "vitest";
import { de } from "./resources/de";
import { en } from "./resources/en";
import { fr } from "./resources/fr";
import { ru } from "./resources/ru";

function leafKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value)
    .flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key))
    .sort();
}

describe("vocabulary translations", () => {
  it("keeps the vocabulary key set complete in every supported language", () => {
    const expected = leafKeys(en.vocabulary);

    expect(leafKeys(ru.vocabulary)).toEqual(expected);
    expect(leafKeys(de.vocabulary)).toEqual(expected);
    expect(leafKeys(fr.vocabulary)).toEqual(expected);
  });
});
