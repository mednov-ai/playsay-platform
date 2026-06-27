import type { LessonMaterialJson, LessonMaterialSubmission } from "../../../shared/api/playsay";
import type { MaterialAnswerBlock, MaterialAnswerState, MaterialAttemptEntry, MaterialEditorBlock, MaterialEditorPage, MaterialHintEntry } from "./types";
import { asJsonObject, asNumber, asString } from "./formatters";

export function materialAnswersFromSubmission(submission: Pick<LessonMaterialSubmission, "content"> | { content?: LessonMaterialJson | null } | null): MaterialAnswerState {
  const content = asJsonObject(submission?.content);
  const answers = asJsonObject(content.answers);
  return Object.entries(answers).reduce<MaterialAnswerState>((result, [blockId, value]) => {
    const answer = asJsonObject(value);
    if (Object.keys(answer).length > 0) {
      result[blockId] = answer;
    }
    return result;
  }, {});
}

export function materialBlockAcceptsAnswers(block: Pick<MaterialEditorBlock, "type">): boolean {
  return block.type === "fillGaps" ||
    block.type === "multipleChoice" ||
    block.type === "matchingPairs" ||
    block.type === "freeWriting";
}

export function materialPageAcceptsAnswers(page: Pick<MaterialEditorPage, "blocks"> | null | undefined): boolean {
  return page?.blocks.some(materialBlockAcceptsAnswers) ?? false;
}

export function materialAnswerItems(answer: MaterialAnswerBlock | undefined): Record<string, string> {
  const items = asJsonObject(answer?.items);
  return Object.entries(items).reduce<Record<string, string>>((result, [key, value]) => {
    const itemValue = asString(value);
    if (itemValue) {
      result[key] = itemValue;
    }
    return result;
  }, {});
}

export function materialAnswerMatches(answer: MaterialAnswerBlock | undefined): Record<string, string> {
  const matches = asJsonObject(answer?.matches);
  return Object.entries(matches).reduce<Record<string, string>>((result, [key, value]) => {
    const matchValue = asString(value);
    if (matchValue) {
      result[key] = matchValue;
    }
    return result;
  }, {});
}

export function materialAnswerMatchOrder(answer: MaterialAnswerBlock | undefined): string[] {
  const order = Array.isArray(answer?.matchOrder) ? answer.matchOrder : [];
  return order
    .map((value) => asString(value))
    .filter(Boolean);
}

export function materialAnswerOptionIds(answer: MaterialAnswerBlock | undefined): Record<string, string> {
  const optionIds = asJsonObject(answer?.optionIds);
  return Object.entries(optionIds).reduce<Record<string, string>>((result, [key, value]) => {
    const optionId = asString(value);
    if (optionId) {
      result[key] = optionId;
    }
    return result;
  }, {});
}

export function materialWordBankUsedOptionIds(answer: MaterialAnswerBlock | undefined): Set<string> {
  return new Set(Object.values(materialAnswerOptionIds(answer)).filter(Boolean));
}

export function materialAnswerAttempts(answer: MaterialAnswerBlock | undefined): Record<string, MaterialAttemptEntry[]> {
  const attempts = asJsonObject(answer?.attempts);
  return Object.entries(attempts).reduce<Record<string, MaterialAttemptEntry[]>>((result, [key, value]) => {
    const rawAttempts = Array.isArray(value) ? value : [];
    const parsed = rawAttempts
      .map((entry) => {
        if (typeof entry === "string") {
          return { at: "", value: entry };
        }
        const object = asJsonObject(entry);
        const valueText = asString(object.value);
        if (!valueText) {
          return null;
        }
        return {
          at: asString(object.at),
          correct: typeof object.correct === "boolean" ? object.correct : undefined,
          optionId: asString(object.optionId) || undefined,
          value: valueText,
        };
      })
      .filter((entry): entry is MaterialAttemptEntry => entry !== null);
    if (parsed.length > 0) {
      result[key] = parsed;
    }
    return result;
  }, {});
}

export function materialAnswerHints(answer: MaterialAnswerBlock | undefined): Record<string, MaterialHintEntry[]> {
  const hints = asJsonObject(answer?.hints);
  return Object.entries(hints).reduce<Record<string, MaterialHintEntry[]>>((result, [key, value]) => {
    const rawHints = Array.isArray(value) ? value : [];
    const parsed = rawHints
      .map((entry) => {
        const object = asJsonObject(entry);
        const type = asString(object.type) || "hint";
        const label = asString(object.label) || asString(object.value);
        if (!label) {
          return null;
        }
        const hintEntry: MaterialHintEntry = {
          at: asString(object.at),
          label,
          penalty: asNumber(object.penalty) ?? 0.15,
          type,
        };
        const hintValue = asString(object.value);
        if (hintValue) {
          hintEntry.value = hintValue;
        }
        return hintEntry;
      })
      .filter((entry): entry is MaterialHintEntry => entry !== null);
    if (parsed.length > 0) {
      result[key] = parsed;
    }
    return result;
  }, {});
}

export function appendMaterialAttempt(
  attempts: Record<string, MaterialAttemptEntry[]>,
  itemKey: string,
  value: string,
  correct: boolean,
  optionId?: string,
): Record<string, MaterialAttemptEntry[]> {
  const cleanValue = value.trim();
  if (!cleanValue) {
    return attempts;
  }
  const current = attempts[itemKey] ?? [];
  const latest = current[current.length - 1];
  if (latest?.value === cleanValue && latest.optionId === optionId && latest.correct === correct) {
    return attempts;
  }
  return {
    ...attempts,
    [itemKey]: [
      ...current,
      {
        at: new Date().toISOString(),
        correct,
        optionId,
        value: cleanValue,
      },
    ],
  };
}

export function materialAnswerText(answer: MaterialAnswerBlock | undefined): string {
  return asString(answer?.text);
}
