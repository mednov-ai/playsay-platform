import { describe, expect, it } from "vitest";
import {
  cleanMaterialBlock,
  FILL_GAP_MARKER,
  materialAcceptedAnswersWithCandidate,
  materialAnswerOptionIds,
  materialAnswerStatus,
  appendMaterialAttempt,
  materialAssessmentForItem,
  materialBlockFromJson,
  materialExerciseItemKey,
  materialItemAnswerMatches,
  materialLiveScore,
  materialWordBankUsedOptionIds,
  materialPromptWithInsertedGapMarker,
  materialPromptWithGapMarker,
  parseExerciseItems,
  formatExerciseItems,
  splitFillGapPrompt,
} from "./materialDocument";
import type { MaterialEditorBlock } from "./types";

describe("material document accepted answers", () => {
  it("keeps a selected video clip through serde and removes invalid bounds", () => {
    const block = materialBlockFromJson({
      id: "video-1",
      type: "videoEmbed",
      title: "Warm-up video",
      provider: "YOUTUBE",
      url: "https://youtu.be/5l-fo-d0gt8",
      videoClip: {
        startSeconds: 12.8,
        endSeconds: 45.2,
      },
    });

    expect(block?.videoClip).toEqual({
      startSeconds: 12,
      endSeconds: 45,
    });

    const clean = cleanMaterialBlock(block as MaterialEditorBlock);
    expect(clean.videoClip).toEqual({
      startSeconds: 12,
      endSeconds: 45,
    });

    expect(cleanMaterialBlock({
      id: "video-2",
      type: "videoEmbed",
      title: "Invalid clip",
      videoClip: {
        startSeconds: 50,
        endSeconds: 40,
      },
    } as MaterialEditorBlock).videoClip).toBeUndefined();
  });

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

  it("keeps form transform base form and typed hint prefix length through serde", () => {
    const block = materialBlockFromJson({
      id: "gaps",
      type: "fillGaps",
      title: "Verb forms",
      items: [
        {
          id: "item-study",
          prompt: "Sam ␣ right now.",
          baseForm: "not study",
          answer: "isn't studying",
          acceptedAnswers: ["is not studying"],
          gapMode: "formTransform",
        },
        {
          id: "item-going",
          prompt: "I do not enjoy ␣ to the cinema.",
          answer: "going",
          hintPrefixLength: 2,
        },
      ],
    });

    expect(block?.items?.[0]).toMatchObject({
      baseForm: "not study",
      gapMode: "formTransform",
    });
    expect(block?.items?.[1]).toMatchObject({
      hintPrefixLength: 2,
    });

    const clean = cleanMaterialBlock(block as MaterialEditorBlock);
    expect(clean.items?.[0]).toMatchObject({
      baseForm: "not study",
      gapMode: "formTransform",
    });
    expect(clean.items?.[1]).toMatchObject({
      hintPrefixLength: 2,
    });
  });

  it("keeps per-item fill gap attempt and hint limits through serde", () => {
    const block = materialBlockFromJson({
      id: "gaps",
      type: "fillGaps",
      title: "Per phrase limits",
      assessment: { maxAttempts: 2, attemptPenalty: 1, hintPenalty: 1, hintCount: 5 },
      wordBankOptions: [{ id: "bank-to", value: "to" }],
      items: [
        {
          id: "typed",
          prompt: "I enjoy ␣ books.",
          answer: "reading",
          maxAttempts: 5,
          hintCount: 4,
        },
        {
          id: "bank",
          prompt: "I am going ␣ school.",
          answer: "to",
          answerOptionId: "bank-to",
          gapMode: "wordBank",
          maxErrors: 3,
        },
        {
          id: "choice",
          prompt: "We met ␣ the station.",
          answer: "at",
          gapMode: "singleChoice",
          maxAttempts: 1,
          options: ["in", "at", "on", "near"],
        },
      ],
    });

    expect(block?.items?.[0]).toMatchObject({ maxAttempts: 5, hintCount: 4 });
    expect(block?.items?.[1]).toMatchObject({ maxErrors: 3 });
    expect(block?.items?.[2]).toMatchObject({ maxAttempts: 1 });

    const clean = cleanMaterialBlock(block as MaterialEditorBlock);
    expect(clean.items?.[0]).toMatchObject({ maxAttempts: 5, hintCount: 4 });
    expect(clean.items?.[1]).toMatchObject({ maxErrors: 3 });
    expect(clean.items?.[2]?.maxAttempts).toBeUndefined();
  });

  it("derives fill gap limits from each item while ignoring teacher-facing penalty fields", () => {
    const block = {
      id: "gaps",
      type: "fillGaps",
      title: "Per phrase limits",
      assessment: { maxAttempts: 2, attemptPenalty: 1, hintPenalty: 1, hintCount: 5 },
      items: [
        { id: "typed", prompt: "I enjoy ␣ books.", answer: "reading", maxAttempts: 5, hintCount: 4 },
        { id: "choice", prompt: "We met ␣ the station.", answer: "at", gapMode: "singleChoice" as const, maxAttempts: 1, options: ["in", "at", "on", "near"] },
        { id: "bank", prompt: "I am going ␣ school.", answer: "to", gapMode: "wordBank" as const, maxErrors: 3 },
      ],
    } as MaterialEditorBlock;

    expect(materialAssessmentForItem(block, block.items?.[0]).maxAttempts).toBe(5);
    expect(materialAssessmentForItem(block, block.items?.[0]).hintCount).toBe(4);
    expect(materialAssessmentForItem(block, block.items?.[0]).attemptPenalty).toBe(0.3);
    expect(materialAssessmentForItem(block, block.items?.[0]).hintPenalty).toBe(0.15);
    expect(materialAssessmentForItem(block, block.items?.[1]).maxAttempts).toBe(4);
    expect(materialAssessmentForItem(block, block.items?.[2]).maxAttempts).toBe(3);
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
    });
    expect(parsed?.[0]?.weight).toBeUndefined();
    expect(formatExerciseItems(parsed, "fillGaps")).toBe("I enjoy ___ books. | reading | reading stories, reading novels");
  });

  it("scores fill gap items evenly without item weights", () => {
    const material = {
      id: "material-weights",
      title: "Weights",
      document: {
        schemaVersion: 1,
        pages: [{
          id: "page-1",
          title: "Page",
          layout: "FLOW",
          blocks: [{
            id: "block-1",
            type: "fillGaps",
            title: "Gaps",
            assessment: { weight: 10 },
            items: [
              { id: "heavy", prompt: "I enjoy ␣ books.", answer: "reading", weight: 9 },
              { id: "light", prompt: "I keep ␣ English.", answer: "studying", weight: 1 },
            ],
          }],
        }],
      },
      scoringRubric: { maxScore: 10 },
    };

    const score = materialLiveScore(material as never, {
      "block-1": {
        type: "fillGaps",
        items: {
          heavy: "reading",
          light: "wrong",
        },
        attempts: {
          heavy: [{ at: "2026-05-30T00:00:00.000Z", value: "reading", correct: true }],
          light: [{ at: "2026-05-30T00:00:00.000Z", value: "wrong", correct: false }],
        },
      },
    });

    expect(score).toBe(5);
  });

  it("scores fill gap retries with fixed factors instead of configurable penalties", () => {
    const material = {
      id: "material-fixed-penalty",
      title: "Fixed penalty",
      document: {
        schemaVersion: 1,
        pages: [{
          id: "page-1",
          title: "Page",
          layout: "FLOW",
          blocks: [{
            id: "block-1",
            type: "fillGaps",
            title: "Gaps",
            assessment: { attemptPenalty: 1, hintPenalty: 1 },
            items: [
              { id: "retry", prompt: "I enjoy ␣ books.", answer: "reading", maxAttempts: 5 },
            ],
          }],
        }],
      },
      scoringRubric: { maxScore: 10 },
    };

    const score = materialLiveScore(material as never, {
      "block-1": {
        type: "fillGaps",
        items: { retry: "reading" },
        attempts: {
          retry: [
            { at: "2026-05-30T00:00:00.000Z", value: "read", correct: false },
            { at: "2026-05-30T00:00:01.000Z", value: "reading", correct: true },
          ],
        },
      },
    });

    expect(score).toBe(7);
  });

  it("keeps matching pair error budget on the block instead of individual pairs", () => {
    const block = materialBlockFromJson({
      id: "matching",
      type: "matchingPairs",
      title: "Match words",
      assessment: { maxErrors: 4 },
      pairs: [
        {
          id: "pair-1",
          left: "elusive",
          right: "difficult to find",
          assessment: { maxErrors: 1 },
        },
      ],
    });

    expect(block?.assessment?.maxErrors).toBe(4);
    expect(block?.pairs?.[0]).not.toHaveProperty("assessment");

    const clean = cleanMaterialBlock(block as MaterialEditorBlock);
    expect(clean.assessment?.maxErrors).toBe(4);
    expect(clean.pairs?.[0]).not.toHaveProperty("assessment");
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
