import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  materialAnswerAttempts,
  materialAnswerMatches,
  materialAnswerMatchOrder,
  type MaterialEditorBlock,
  type MaterialMatchingPair,
} from "../../model/materialDocument";
import {
  RenderedMatchingPairsExercise,
  materialMatchingAnswerAfterSelection,
  materialMatchingSolvedPairs,
} from "./RenderedMatchingPairsExercise";

const pairs: MaterialMatchingPair[] = [
  { id: "pair-a", left: "to think through", right: "to consider", targetKind: "TEXT" },
  { id: "pair-b", left: "elusive", right: "difficult to find", targetKind: "TEXT" },
  { id: "pair-c", left: "an immediate goal", right: "being achieved first", targetKind: "TEXT" },
];

const block = {
  id: "block-matching",
  type: "matchingPairs",
  title: "Match the words",
  pairs,
} as MaterialEditorBlock;

const imagePairs: MaterialMatchingPair[] = [
  {
    id: "pair-image",
    imageAlt: "A small orange house",
    imageUrl: "material-asset:house",
    left: "house",
    right: "house",
    targetKind: "IMAGE",
  },
];

const imageBlock = {
  id: "block-image-matching",
  type: "matchingPairs",
  title: "Match the pictures",
  pairs: imagePairs,
} as MaterialEditorBlock;

describe("RenderedMatchingPairsExercise card flow", () => {
  it("moves solved pairs to the solved area in the order the student finds them", () => {
    const firstAnswer = materialMatchingAnswerAfterSelection(undefined, pairs, "pair-b", "pair-b");
    const secondAnswer = materialMatchingAnswerAfterSelection(firstAnswer, pairs, "pair-a", "pair-a");

    expect(materialAnswerMatchOrder(secondAnswer)).toEqual(["pair-b", "pair-a"]);
    expect(materialMatchingSolvedPairs(pairs, materialAnswerMatches(secondAnswer), materialAnswerMatchOrder(secondAnswer)).map((pair) => pair.id)).toEqual([
      "pair-b",
      "pair-a",
    ]);
  });

  it("records wrong clicks as attempts without storing a match", () => {
    const nextAnswer = materialMatchingAnswerAfterSelection(undefined, pairs, "pair-a", "pair-b");

    expect(materialAnswerMatches(nextAnswer)).toEqual({});
    expect(materialAnswerMatchOrder(nextAnswer)).toEqual([]);
    expect(materialAnswerAttempts(nextAnswer)["pair-a"]).toHaveLength(1);
    expect(materialAnswerAttempts(nextAnswer)["pair-a"][0]).toMatchObject({
      correct: false,
      value: "pair-b",
    });
  });

  it("renders matching cards and solved pairs without SVG connector lines", () => {
    const answer = {
      type: "matchingPairs",
      matches: { "pair-b": "pair-b" },
      matchOrder: ["pair-b"],
    };
    const markup = renderToStaticMarkup(createElement(RenderedMatchingPairsExercise, {
      answer,
      assetUrls: {},
      block,
      mode: "classroom",
    }));

    expect(markup).toContain("playsay-match-columns");
    expect(markup).toContain("playsay-match-solved");
    expect(markup).toContain("playsay-match-solved-pair");
    expect(markup).not.toContain("playsay-match-lines");
    expect(markup).not.toContain("<svg");
  });

  it("does not render per-card attempt bars for matching pairs", () => {
    const markup = renderToStaticMarkup(createElement(RenderedMatchingPairsExercise, {
      assetUrls: {},
      block,
      mode: "classroom",
    }));

    expect(markup).not.toContain("playsay-answer-attempt-bar");
  });

  it("highlights the matching pair currently selected by a remote participant", () => {
    const markup = renderToStaticMarkup(createElement(RenderedMatchingPairsExercise, {
      assetUrls: {},
      block,
      mode: "classroom",
      participants: [{
        clientId: 9,
        color: "#00a878",
        interaction: {
          blockId: "block-matching",
          kind: "matchingSelection",
          leftId: "pair-a",
          rightId: "pair-b",
        },
        name: "Teacher",
      }],
    }));

    expect(markup.match(/data-live-active="true"/g)).toHaveLength(2);
    expect(markup).toContain("--playsay-live-color:#00a878");
    expect(markup).toContain("title=\"Teacher\"");
  });

  it("renders image targets with a shared sizing hook in unresolved and solved cards", () => {
    const markup = renderToStaticMarkup(createElement(RenderedMatchingPairsExercise, {
      answer: {
        type: "matchingPairs",
        matches: { "pair-image": "pair-image" },
        matchOrder: ["pair-image"],
      },
      assetUrls: {
        house: "/api/materials/material-1/assets/house/content",
      },
      block: imageBlock,
      mode: "classroom",
    }));

    expect(markup).toContain("playsay-match-target");
    expect(markup).toContain("data-kind=\"image\"");
    expect(markup).toContain("src=\"/api/materials/material-1/assets/house/content\"");
  });

  it("locks unresolved cards after the global error budget is used", () => {
    const markup = renderToStaticMarkup(createElement(RenderedMatchingPairsExercise, {
      answer: {
        type: "matchingPairs",
        matches: {},
        attempts: {
          "pair-a": [
            { at: "", value: "pair-b", correct: false },
            { at: "", value: "pair-c", correct: false },
          ],
        },
      },
      assetUrls: {},
      block: {
        ...block,
        assessment: { maxErrors: 2 },
      },
      mode: "classroom",
    }));

    expect(markup).toContain("data-status=\"locked\"");
    expect(markup.match(/disabled=""/g)).toHaveLength(6);
  });
});
