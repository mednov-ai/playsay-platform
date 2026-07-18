import { describe, expect, it } from "vitest";
import { hasInvalidManualHtmlGameTitle, isEnglishHtmlGameTitle } from "./htmlGameTitle";
import type { MaterialEditorDocument } from "./types";

describe("HTML game title policy", () => {
  it("accepts Latin titles with numbers and punctuation", () => {
    expect(isEnglishHtmlGameTitle("Pair Up! — Level 2")).toBe(true);
    expect(isEnglishHtmlGameTitle("Café Word Race")).toBe(true);
  });

  it("rejects titles without Latin letters or with another script", () => {
    expect(isEnglishHtmlGameTitle("Найди рифму")).toBe(false);
    expect(isEnglishHtmlGameTitle("English Гонка")).toBe(false);
    expect(isEnglishHtmlGameTitle("123 — !!!")).toBe(false);
  });

  it("only validates manually edited HTML game titles", () => {
    const document = {
      schemaVersion: 1,
      pages: [{
        id: "page-1",
        title: "Games",
        layout: "FLOW",
        blocks: [
          { id: "game-1", type: "htmlGame", title: "Русская игра", gameTitleSource: "HTML" },
          { id: "game-2", type: "htmlGame", title: "My Гонка", gameTitleSource: "USER" },
        ],
      }],
    } as MaterialEditorDocument;

    expect(hasInvalidManualHtmlGameTitle(document)).toBe(true);
  });
});
