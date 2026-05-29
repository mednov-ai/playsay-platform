import { describe, expect, it } from "vitest";
import {
  cleanMaterialBlock,
  FILL_GAP_MARKER,
  materialAcceptedAnswersWithCandidate,
  materialBlockFromJson,
  materialExerciseItemKey,
  materialItemAnswerMatches,
  materialPromptWithGapMarker,
  parseExerciseItems,
  formatExerciseItems,
  splitFillGapPrompt,
} from "./materialDocument";
import type { MaterialEditorBlock } from "./types";

describe("material document accepted answers", () => {
  it("keeps stable item ids and accepted answer variants through serde", () => {
    const block = materialBlockFromJson({
      id: "gaps",
      type: "fillGaps",
      title: "Verb forms",
      items: [
        {
          id: "item-go",
          prompt: "I don't enjoy ___ to the cinema.",
          answer: "going",
          acceptedAnswers: ["going out", "going alone", "going"],
          choices: ["go", "going"],
        },
      ],
    });

    expect(block?.items?.[0]).toMatchObject({
      id: "item-go",
      answer: "going",
      acceptedAnswers: ["going out", "going alone"],
      options: ["go", "going"],
    });

    const clean = cleanMaterialBlock(block as MaterialEditorBlock);
    expect(clean.items?.[0]).toMatchObject({
      id: "item-go",
      answer: "going",
      acceptedAnswers: ["going out", "going alone"],
    });
  });

  it("matches primary and accepted answers with the same normalization", () => {
    const item = {
      id: "item-about",
      prompt: "She said she's thinking ___ a bit.",
      answer: "about it",
      acceptedAnswers: ["about that", "about this"],
    };

    expect(materialItemAnswerMatches(item, "about it")).toBe(true);
    expect(materialItemAnswerMatches(item, "About that")).toBe(true);
    expect(materialItemAnswerMatches(item, "about them")).toBe(false);
  });

  it("uses stable item id as the answer key when available", () => {
    expect(materialExerciseItemKey({ id: "item-1", prompt: "___ apple", answer: "an" }, 0)).toBe("item-1");
    expect(materialExerciseItemKey({ prompt: "___ apple", answer: "an" }, 0)).toBe("___ apple-0");
  });

  it("parses and formats accepted answers in bulk exercise input", () => {
    const parsed = parseExerciseItems("I enjoy ___ books. | reading | reading stories, reading novels | 2", "fillGaps");

    expect(parsed?.[0]).toMatchObject({
      prompt: "I enjoy ___ books.",
      answer: "reading",
      acceptedAnswers: ["reading stories", "reading novels"],
      weight: 2,
    });
    expect(formatExerciseItems(parsed, "fillGaps")).toBe("I enjoy ___ books. | reading | reading stories, reading novels | 2");
  });

  it("uses a visible blank marker while keeping legacy underscore prompts readable", () => {
    expect(FILL_GAP_MARKER).toBe("␣");
    expect(materialPromptWithGapMarker("I am")).toBe("I am ␣ ");
    expect(materialPromptWithGapMarker("I am ___ ready")).toBe("I am ___ ready");
    expect(splitFillGapPrompt("I am ␣ ready")).toEqual({ before: "I am", after: "ready" });
    expect(splitFillGapPrompt("I am ___ ready")).toEqual({ before: "I am", after: "ready" });
  });

  it("adds manual and AI accepted answers as unique variants excluding the primary answer", () => {
    expect(materialAcceptedAnswersWithCandidate(["going out"], "going", "going alone")).toEqual(["going out", "going alone"]);
    expect(materialAcceptedAnswersWithCandidate(["going out"], "going", "Going out")).toEqual(["going out"]);
    expect(materialAcceptedAnswersWithCandidate(["going out"], "going", " going ")).toEqual(["going out"]);
  });
});
