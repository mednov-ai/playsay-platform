import { i18n } from "../../../shared/i18n";
import {
  isMaterialNormalizationTerm,
  materialFillGapMode,
  materialHintPrefixLength,
  materialNormalizationTerms,
} from "./formatters";
import {
  materialAssessmentForItem,
  materialExerciseItemKey,
  materialItemAnswerMatches,
} from "./scoring";
import {
  MAX_MANUAL_INPUT_HINTS,
  MIN_MANUAL_INPUT_HINTS,
  type MaterialAnswerStatus,
  type MaterialEditorBlock,
  type MaterialExerciseItem,
  type MaterialHintEntry,
} from "./types";

export function omitMaterialAnswerKey(record: Record<string, string>, key: string): Record<string, string> {
  const next = { ...record };
  delete next[key];
  return next;
}

export function longestMaterialInputText(...values: Array<string | undefined>): string {
  return values.reduce<string>((longest, value) => {
    const cleanValue = value?.trim() ?? "";
    return Array.from(cleanValue).length > Array.from(longest).length ? cleanValue : longest;
  }, "");
}

export function materialAttemptBarVisible(status: MaterialAnswerStatus): boolean {
  return status.maxAttempts > 0;
}

export function materialAttemptBarRedPercent(status: MaterialAnswerStatus, hintLimit = MIN_MANUAL_INPUT_HINTS): number {
  if (status.locked) {
    return 100;
  }

  const maxAttempts = Math.max(1, status.maxAttempts);
  const errorPercent = Math.min(100, Math.max(0, (status.incorrectAttempts / maxAttempts) * 100));
  const hintPercent = Math.min(100, Math.max(0, (status.hintsUsed / Math.max(MIN_MANUAL_INPUT_HINTS, hintLimit)) * 100));
  return Math.max(errorPercent, hintPercent);
}

export function materialExerciseOptions(item: MaterialExerciseItem, block: MaterialEditorBlock): string[] {
  if (materialFillGapMode(item) === "wordBank") {
    return [];
  }
  const configuredOptions = uniqueMaterialOptions(item.options ?? []);
  if (configuredOptions.length > 0) {
    return configuredOptions;
  }

  const answer = normalizeArticleAnswer(item.answer);
  const articleContext = `${block.title} ${block.body ?? ""} ${block.prompt ?? ""} ${item.prompt}`.toLowerCase();
  if (
    ["a", "an", "-"].includes(answer) ||
    materialNormalizationTerms("articleContext").some((term) => articleContext.includes(term))
  ) {
    return ["a", "an", "-"];
  }

  return [];
}

export function materialFillGapWordBankOptions(block: MaterialEditorBlock): NonNullable<MaterialEditorBlock["wordBankOptions"]> {
  if (block.wordBankOptions?.length) {
    return block.wordBankOptions;
  }

  return (block.items ?? [])
    .filter((item) => materialFillGapMode(item) === "wordBank")
    .map((item, index) => ({
      id: item.answerOptionId || materialExerciseItemKey(item, index),
      value: item.answer?.trim() ?? "",
    }))
    .filter((option) => option.value);
}

export function appendMaterialHint(
  hints: Record<string, MaterialHintEntry[]>,
  itemKey: string,
  hint: MaterialHintEntry,
): Record<string, MaterialHintEntry[]> {
  const current = hints[itemKey] ?? [];
  return {
    ...hints,
    [itemKey]: [...current, hint],
  };
}

export function canRequestManualInputHint(
  item: MaterialExerciseItem,
  hints: MaterialHintEntry[],
  status: MaterialAnswerStatus,
  hintLimit = MAX_MANUAL_INPUT_HINTS,
): boolean {
  return Boolean(item.answer?.trim()) && hints.length < hintLimit && !status.locked && !status.correct;
}

export function materialManualInputHintPreview(item: MaterialExerciseItem, hints: MaterialHintEntry[]): string {
  const latestHint = hints[hints.length - 1];
  if (latestHint?.value) {
    return latestHint.value;
  }
  if (hints.length === 0) {
    return "";
  }
  return materialManualInputHintValue(item.answer ?? "", hints.length, materialManualInputHintLimit(item.answer ?? ""), materialHintPrefixLength(item));
}

export function materialManualInputInlineHint(item: MaterialExerciseItem, hints: MaterialHintEntry[], value: string): string {
  const hint = materialManualInputHintPreview(item, hints);
  const cleanValue = value.trim();
  if (!hint) {
    return "";
  }

  if (!cleanValue) {
    return hint;
  }

  if (materialItemAnswerMatches(item, cleanValue)) {
    return "";
  }

  const hintPrefix = hint.replace(/\.\.\.$/, "");
  if (hintPrefix && cleanValue.toLowerCase().startsWith(hintPrefix.toLowerCase())) {
    return "";
  }

  if (hintPrefix.toLowerCase().startsWith(cleanValue.toLowerCase())) {
    const suffix = hintPrefix.slice(cleanValue.length);
    return suffix ? `${suffix}...` : "";
  }

  if (normalizeArticleAnswer(hint) === normalizeArticleAnswer(cleanValue)) {
    return "";
  }

  return hint;
}

export function materialManualInputVisualCharacters(value: string, hint: string, maxCharacters = 18, minCharacters = 4): number {
  const valueCharacters = Array.from(value.trim()).length;
  const hintCharacters = Array.from(hint.replace(/\.\.\.$/, "")).length;
  return Math.min(maxCharacters, Math.max(minCharacters, valueCharacters + hintCharacters + 1));
}

export function materialHintForExerciseItem(item: MaterialExerciseItem, block: MaterialEditorBlock, hintNumber: number): MaterialHintEntry {
  const answer = item.answer?.trim() ?? "";
  const policy = materialAssessmentForItem(block, item);
  const penalty = policy.hintPenalty ?? 0.15;
  const hintLimit = materialManualInputHintLimit(answer, policy.hintCount);
  const level = Math.min(Math.max(hintNumber, 1), hintLimit);
  const value = materialManualInputHintValue(answer, level, hintLimit, materialHintPrefixLength(item));
  const fullAnswerVisible = Boolean(answer) && normalizeArticleAnswer(value) === normalizeArticleAnswer(answer);
  const type = fullAnswerVisible ? "fullAnswer" : level === 1 ? "firstLetter" : "partialAnswer";
  return {
    at: new Date().toISOString(),
    label: fullAnswerVisible
      ? i18n.t("materials.renderer.answerHint", { value })
      : i18n.t("materials.renderer.hintValue", { level, value }),
    penalty,
    type,
    value,
  };
}

export function materialManualInputHintLimit(answer: string, configuredHintCount = MIN_MANUAL_INPUT_HINTS): number {
  const characterCount = Array.from(answer.trim().replace(/\s+/g, "")).length;
  if (characterCount <= 0) {
    return MIN_MANUAL_INPUT_HINTS;
  }

  const requestedHints = Math.round(Math.min(MAX_MANUAL_INPUT_HINTS, Math.max(MIN_MANUAL_INPUT_HINTS, configuredHintCount)));
  const lengthLimit = characterCount >= 7
    ? MAX_MANUAL_INPUT_HINTS
    : characterCount >= 4
      ? 4
      : MIN_MANUAL_INPUT_HINTS;
  return Math.min(requestedHints, lengthLimit);
}

export function materialManualInputHintValue(answer: string, level: number, hintLimit = MIN_MANUAL_INPUT_HINTS, hintPrefixLength = 0): string {
  const cleanAnswer = answer.trim();
  if (!cleanAnswer) {
    return "";
  }

  const cleanHintLimit = Math.max(MIN_MANUAL_INPUT_HINTS, hintLimit);
  const cleanLevel = Math.min(Math.max(level, 1), cleanHintLimit);
  const cleanPrefixLength = hintPrefixLength === 1 || hintPrefixLength === 2 ? hintPrefixLength : 0;
  return cleanAnswer
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) {
        return part;
      }
      const characters = Array.from(part);
      if (characters.length === 0) {
        return "";
      }
      const proportionalRevealCount = cleanLevel >= cleanHintLimit
        ? characters.length
        : Math.max(1, Math.min(characters.length, Math.ceil(characters.length * cleanLevel / cleanHintLimit)));
      const revealCount = cleanPrefixLength > 0 && cleanLevel === 1
        ? Math.min(characters.length, cleanPrefixLength)
        : Math.max(Math.min(characters.length, cleanPrefixLength), proportionalRevealCount);
      return characters.slice(0, revealCount).join("");
    })
    .join("");
}

function uniqueMaterialOptions(options: string[]): string[] {
  const result: string[] = [];
  options.forEach((option) => {
    const normalized = option.trim();
    if (normalized && !result.includes(normalized)) {
      result.push(normalized);
    }
  });
  return result;
}

function normalizeArticleAnswer(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (isMaterialNormalizationTerm("noArticle", normalized)) {
    return "-";
  }
  return normalized;
}
