import type { MaterialEditorDocument } from "./types";

const unicodeLetter = /\p{L}/u;
const latinLetter = /\p{Script=Latin}/u;

export function isEnglishHtmlGameTitle(title: string): boolean {
  const letters = Array.from(title.trim()).filter((character) => unicodeLetter.test(character));
  return letters.length > 0 && letters.every((character) => latinLetter.test(character));
}

export function hasInvalidManualHtmlGameTitle(document: MaterialEditorDocument): boolean {
  return document.pages.some((page) => page.blocks.some((block) =>
    block.type === "htmlGame"
    && block.gameTitleSource === "USER"
    && !isEnglishHtmlGameTitle(block.title),
  ));
}
