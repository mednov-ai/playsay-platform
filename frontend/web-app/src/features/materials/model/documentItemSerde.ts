import type { MaterialEditorBlock, MaterialFillGapMode, MaterialWordBankOption } from "./types";
import {
  asJsonObject,
  asNumber,
  asPositiveNumber,
  asString,
  createClientId,
  normalizeMaterialAnswer,
  uniqueMaterialOptions,
} from "./formatters";

export function cleanMaterialWordBankOptions(options: MaterialWordBankOption[]): MaterialWordBankOption[] {
  const seenIds = new Set<string>();
  return options
    .map((option) => ({
      id: option.id?.trim() || createClientId("bank"),
      value: option.value.trim(),
    }))
    .filter((option) => {
      if (!option.value || seenIds.has(option.id)) {
        return false;
      }
      seenIds.add(option.id);
      return true;
    });
}

export function materialCardFromJson(value: unknown): NonNullable<MaterialEditorBlock["cards"]>[number] | null {
  const card = asJsonObject(value);
  const front = asString(card.front);
  const back = asString(card.back);
  if (!front && !back) {
    return null;
  }

  return {
    id: asString(card.id) || createClientId("card"),
    front,
    back,
    example: asString(card.example) || undefined,
  };
}

export function materialItemFromJson(value: unknown): NonNullable<MaterialEditorBlock["items"]>[number] | null {
  const item = asJsonObject(value);
  const prompt = asString(item.prompt);
  if (!prompt) {
    return null;
  }
  const options = Array.isArray(item.options) ? item.options.map(asString).filter(Boolean) : [];
  const choices = Array.isArray(item.choices) ? item.choices.map(asString).filter(Boolean) : [];
  const answer = asString(item.answer) || asString(item.correct) || undefined;
  const baseForm = asString(item.baseForm) || asString(item.givenForm) || asString(item.initialValue) || asString(item.sourceForm) || undefined;
  const acceptedAnswers = uniqueMaterialOptions([
    ...(Array.isArray(item.acceptedAnswers) ? item.acceptedAnswers.map(asString) : []),
    ...(Array.isArray(item.variants) ? item.variants.map(asString) : []),
  ]).filter((acceptedAnswer) => normalizeMaterialAnswer(acceptedAnswer) !== normalizeMaterialAnswer(answer));
  const aiSuggestedAnswers = (Array.isArray(item.aiSuggestedAnswers) ? item.aiSuggestedAnswers : [])
    .map((suggestion) => {
      const suggestionObject = asJsonObject(suggestion);
      const value = asString(suggestionObject.value);
      if (!value) {
        return null;
      }
      return {
        value,
        reason: asString(suggestionObject.reason),
        confidence: asNumber(suggestionObject.confidence) ?? 0,
      };
    })
    .filter((suggestion): suggestion is NonNullable<NonNullable<MaterialEditorBlock["items"]>[number]["aiSuggestedAnswers"]>[number] => suggestion !== null);

  return {
    id: asString(item.id) || undefined,
    prompt,
    answer,
    answerOptionId: asString(item.answerOptionId) || undefined,
    acceptedAnswers,
    aiSuggestedAnswers,
    baseForm,
    gapMode: normalizeMaterialFillGapMode(asString(item.gapMode) || asString(item.mode) || asString(item.interactionMode)),
    hintPrefixLength: normalizeMaterialHintPrefixLength(asNumber(item.hintPrefixLength) ?? asNumber(item.hintPrefixLetters)),
    hintCount: normalizeMaterialItemHintCount(asNumber(item.hintCount) ?? asNumber(asJsonObject(item.assessment).hintCount)),
    maxAttempts: normalizeMaterialItemMaxAttempts(asNumber(item.maxAttempts) ?? asNumber(asJsonObject(item.assessment).maxAttempts)),
    maxErrors: normalizeMaterialItemMaxErrors(asNumber(item.maxErrors) ?? asNumber(item.maxAttempts) ?? asNumber(asJsonObject(item.assessment).maxErrors)),
    options: uniqueMaterialOptions([...options, ...choices]),
    threadRootItemId: asString(item.threadRootItemId) || asString(item.continuationOfItemId) || undefined,
    weight: asPositiveNumber(item.weight) ?? asPositiveNumber(asJsonObject(item.assessment).weight) ?? undefined,
  };
}

export function materialWordBankOptionFromJson(value: unknown): MaterialWordBankOption | null {
  const option = asJsonObject(value);
  const rawValue = asString(option.value) || asString(option.label) || asString(option.text);
  if (!rawValue) {
    return null;
  }
  return {
    id: asString(option.id) || createClientId("bank"),
    value: rawValue,
  };
}

export function normalizeMaterialFillGapMode(value: string | undefined): MaterialFillGapMode {
  if (value === "singleChoice" || value === "wordBank" || value === "formTransform") {
    return value;
  }
  return "typed";
}

export function normalizeMaterialHintPrefixLength(value: number | undefined | null): 1 | 2 | undefined {
  const cleanValue = Math.round(Number(value ?? 0));
  return cleanValue === 1 || cleanValue === 2 ? cleanValue : undefined;
}

export function normalizeMaterialItemMaxAttempts(value: number | undefined | null): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return Math.round(Math.min(10, Math.max(1, Number(value))));
}

export function normalizeMaterialItemMaxErrors(value: number | undefined | null): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return Math.round(Math.min(10, Math.max(1, Number(value))));
}

export function normalizeMaterialItemHintCount(value: number | undefined | null): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return Math.round(Math.min(5, Math.max(3, Number(value))));
}
