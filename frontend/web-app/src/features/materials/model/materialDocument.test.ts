import { describe, expect, it } from "vitest";
import {
  cleanMaterialBlock,
  FILL_GAP_MARKER,
  materialAcceptedAnswersWithCandidate,
  materialAnswerOptionIds,
  materialAnswerStatus,
  appendMaterialAttempt,
  materialBlockFromJson,
  materialExerciseItemKey,
  materialItemAnswerMatches,
  materialWordBankUsedOptionIds,
  materialPromptWithInsertedGapMarker,
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

  it("keeps fill gap continuation threads through serde", () => {
    const block = materialBlockFromJson({
      id: "gaps",
      type: "fillGaps",
      title: "Threaded sentence",
      items: [
        {
          id: "item-root",
          prompt: "I am ␣ the airport.",
          answer: "at",
        },
        {
          id: "item-continuation",
          threadRootItemId: "item-root",
          prompt: "and I am waiting ␣ gate 4.",
          answer: "at",
        },
      ],
    });

    expect(block?.items?.[1]).toMatchObject({
      id: "item-continuation",
      threadRootItemId: "item-root",
    });

    const clean = cleanMaterialBlock(block as MaterialEditorBlock);
    expect(clean.items?.[1]).toMatchObject({
      id: "item-continuation",
      threadRootItemId: "item-root",
    });
  });

  it("keeps universal fill gap mode and shared word bank options through serde", () => {
    const block = materialBlockFromJson({
      id: "gaps",
      type: "fillGaps",
      title: "Airport prepositions",
      wordBankOptions: [
        { id: "bank-to-1", value: "to" },
        { id: "bank-to-2", value: "to" },
        { id: "bank-at", value: "at" },
      ],
      items: [
        {
          id: "item-arrive",
          prompt: "I am going ␣ the airport.",
          answer: "to",
          answerOptionId: "bank-to-1",
          gapMode: "wordBank",
        },
        {
          id: "item-wait",
          prompt: "I am waiting ␣ gate 4.",
          answer: "at",
          gapMode: "singleChoice",
          options: ["in", "at", "on"],
        },
      ],
    });

    expect(block?.wordBankOptions).toEqual([
      { id: "bank-to-1", value: "to" },
      { id: "bank-to-2", value: "to" },
      { id: "bank-at", value: "at" },
    ]);
    expect(block?.items?.[0]).toMatchObject({
      answerOptionId: "bank-to-1",
      gapMode: "wordBank",
    });
    expect(block?.items?.[1]).toMatchObject({
      gapMode: "singleChoice",
      options: ["in", "at", "on"],
    });

    const clean = cleanMaterialBlock(block as MaterialEditorBlock);
    expect(clean.wordBankOptions).toEqual([
      { id: "bank-to-1", value: "to" },
      { id: "bank-to-2", value: "to" },
      { id: "bank-at", value: "at" },
    ]);
    expect(clean.items?.[0]).toMatchObject({
      answerOptionId: "bank-to-1",
      gapMode: "wordBank",
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

  it("matches word bank answers by option id so duplicate words remain distinct", () => {
    const item = {
      id: "item-arrive",
      prompt: "I am going ␣ the airport.",
      answer: "to",
      answerOptionId: "bank-to-2",
      gapMode: "wordBank" as const,
    };

    expect(materialItemAnswerMatches(item, "to", "bank-to-2")).toBe(true);
    expect(materialItemAnswerMatches(item, "to", "bank-to-1")).toBe(false);
    expect(materialItemAnswerMatches(item, "to")).toBe(false);
  });

  it("marks word bank answers correct only when the assigned option id matches", () => {
    const item = {
      id: "item-arrive",
      prompt: "I am going ␣ the airport.",
      answer: "to",
      answerOptionId: "bank-to-2",
      gapMode: "wordBank" as const,
    };

    expect(materialAnswerStatus(item, "to", [], [], undefined, false, "bank-to-2").kind).toBe("correct");
    expect(materialAnswerStatus(item, "to", [], [], undefined, false, "bank-to-1").kind).toBe("wrong");
  });

  it("keeps failed word bank attempts visible after the wrong token returns to the bank", () => {
    const item = {
      id: "item-arrive",
      prompt: "I am going ␣ the airport.",
      answer: "to",
      answerOptionId: "bank-to-2",
      gapMode: "wordBank" as const,
    };

    const status = materialAnswerStatus(
      item,
      "",
      [{ at: "2026-05-30T00:00:00.000Z", value: "to", optionId: "bank-to-1", correct: false }],
      [],
      undefined,
      false,
    );

    expect(status.kind).toBe("wrong");
    expect(status.incorrectAttempts).toBe(1);
  });

  it("keeps hint-only fill gap state visible for scoring indicators", () => {
    const item = {
      id: "item-wait",
      prompt: "I am waiting ␣ gate 4.",
      answer: "at",
    };

    const status = materialAnswerStatus(
      item,
      "",
      [],
      [{ at: "2026-05-30T00:00:00.000Z", label: "Hint 1: a...", penalty: 0.15, type: "firstLetter", value: "a..." }],
      undefined,
      true,
    );

    expect(status.kind).toBe("hint");
    expect(status.hintsUsed).toBe(1);
  });

  it("tracks used word bank option ids separately from displayed duplicate words", () => {
    const answerBlock = {
      items: {
        "item-arrive": "to",
        "item-go": "to",
      },
      optionIds: {
        "item-arrive": "bank-to-1",
        "item-go": "bank-to-2",
      },
    };

    expect(materialAnswerOptionIds(answerBlock)).toEqual({
      "item-arrive": "bank-to-1",
      "item-go": "bank-to-2",
    });
    expect(materialWordBankUsedOptionIds(answerBlock)).toEqual(new Set(["bank-to-1", "bank-to-2"]));
  });

  it("keeps duplicate word bank attempts separate by option id", () => {
    const afterWrong = appendMaterialAttempt({}, "item-arrive", "to", false, "bank-to-1");
    const afterCorrect = appendMaterialAttempt(afterWrong, "item-arrive", "to", true, "bank-to-2");

    expect(afterCorrect["item-arrive"]).toMatchObject([
      { value: "to", correct: false, optionId: "bank-to-1" },
      { value: "to", correct: true, optionId: "bank-to-2" },
    ]);
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

  it("inserts the visible blank marker at the current cursor or selection", () => {
    expect(materialPromptWithInsertedGapMarker("I am ready", 5, 5)).toEqual({
      prompt: "I am ␣ ready",
      cursor: 6,
    });
    expect(materialPromptWithInsertedGapMarker("I am at home", 5, 7)).toEqual({
      prompt: "I am ␣ home",
      cursor: 6,
    });
    expect(materialPromptWithInsertedGapMarker("I am ␣ ready", 12, 12)).toEqual({
      prompt: "I am ␣ ready ␣ ",
      cursor: 14,
    });
  });

  it("adds manual and AI accepted answers as unique variants excluding the primary answer", () => {
    expect(materialAcceptedAnswersWithCandidate(["going out"], "going", "going alone")).toEqual(["going out", "going alone"]);
    expect(materialAcceptedAnswersWithCandidate(["going out"], "going", "Going out")).toEqual(["going out"]);
    expect(materialAcceptedAnswersWithCandidate(["going out"], "going", " going ")).toEqual(["going out"]);
  });
});
