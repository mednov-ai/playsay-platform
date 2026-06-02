import { type KeyboardEvent } from "react";
import { CornerDownLeft } from "lucide-react";
import {
  appendMaterialAttempt,
  appendMaterialHint,
  canRequestManualInputHint,
  materialAnswerAttempts,
  materialAnswerContextForBlock,
  materialAnswerHints,
  materialAnswerItems,
  materialAnswerStatus,
  materialExerciseOptions,
  materialExerciseItemKey,
  materialHintForExerciseItem,
  materialItemAnswerMatches,
  materialManualInputInlineHint,
  materialManualInputHintPreview,
  type MaterialAnswerBlock,
  type MaterialEditorBlock,
  type MaterialExerciseItem,
} from "../../model/materialDocument";
import { MaterialAnswerTools, MaterialAttemptBar } from "./MaterialAnswerControls";
import { MarkdownInline } from "../markdown/RenderedMarkdown";
import { useAppTranslation } from "../../../../shared/i18n";

export function RenderedChoiceExercise({
  answer,
  block,
  onAnswerChange,
}: {
  answer?: MaterialAnswerBlock;
  block: MaterialEditorBlock;
  onAnswerChange?: (blockId: string, answer: MaterialAnswerBlock) => void;
}) {
  const { t } = useAppTranslation();
  const answers = materialAnswerItems(answer);
  const attempts = materialAnswerAttempts(answer);
  const hints = materialAnswerHints(answer);

  function updateItemValue(itemKey: string, value: string) {
    onAnswerChange?.(block.id, {
      type: "multipleChoice",
      items: {
        ...answers,
        [itemKey]: value,
      },
      attempts,
      context: materialAnswerContextForBlock(block),
      hints,
    });
  }

  function checkItem(itemKey: string, value = answers[itemKey] ?? "") {
    const item = (block.items ?? []).find((candidate, index) => materialExerciseItemKey(candidate, index) === itemKey);
    const nextAttempts = appendMaterialAttempt(attempts, itemKey, value, materialItemAnswerMatches(item, value));
    onAnswerChange?.(block.id, {
      type: "multipleChoice",
      items: {
        ...answers,
        [itemKey]: value,
      },
      attempts: nextAttempts,
      context: materialAnswerContextForBlock(block),
      hints,
    });
  }

  function requestHint(itemKey: string, item: MaterialExerciseItem) {
    const itemHints = hints[itemKey] ?? [];
    const status = materialAnswerStatus(item, answers[itemKey], attempts[itemKey], itemHints, block.assessment, true);
    if (!canRequestManualInputHint(item, itemHints, status)) {
      return;
    }

    onAnswerChange?.(block.id, {
      type: "multipleChoice",
      items: answers,
      attempts,
      context: materialAnswerContextForBlock(block),
      hints: appendMaterialHint(hints, itemKey, materialHintForExerciseItem(item, block, itemHints.length + 1)),
    });
  }

  function handleManualInputKeyDown(event: KeyboardEvent<HTMLInputElement>, itemKey: string) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    checkItem(itemKey, event.currentTarget.value);
  }

  return (
    <div className="playsay-choice-list">
      {(block.items ?? []).map((item, index) => {
        const itemKey = materialExerciseItemKey(item, index);
        const options = materialExerciseOptions(item, block);
        const isManualInput = options.length === 0;
        const itemHints = hints[itemKey] ?? [];
        const status = materialAnswerStatus(item, answers[itemKey], attempts[itemKey], itemHints, block.assessment, isManualInput);
        const hintPreview = isManualInput ? materialManualInputHintPreview(item, itemHints) : "";
        const inlineHint = isManualInput ? materialManualInputInlineHint(item, itemHints, answers[itemKey] ?? "") : "";
        const canRequestHint = isManualInput && canRequestManualInputHint(item, itemHints, status);

        return (
          <div className="playsay-answer-row" data-input-mode={isManualInput ? "manual" : "select"} data-status={status.kind} key={itemKey}>
            <label className="playsay-choice-row" data-status={status.kind}>
              <MarkdownInline value={item.prompt} />
              {options.length > 0 ? (
                <span className="playsay-inline-answer-wrap">
                  <select
                    aria-label={t("materials.renderer.choiceNumber", { number: index + 1 })}
                    className="playsay-inline-select"
                    data-status={status.kind}
                    disabled={status.locked || status.correct}
                    onChange={(event) => {
                      if (!event.target.value) {
                        return;
                      }
                      checkItem(itemKey, event.target.value);
                    }}
                    value={answers[itemKey] ?? ""}
                  >
                    <option disabled hidden value="">{t("materials.renderer.selectPlaceholder")}</option>
                    {options.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <MaterialAttemptBar status={status} />
                </span>
              ) : (
                <span className="playsay-inline-answer-wrap">
                  <span className="playsay-inline-answer" data-status={status.kind}>
                    <input
                      aria-label={t("materials.renderer.choiceNumber", { number: index + 1 })}
                      className="playsay-inline-input"
                      disabled={status.locked || status.correct}
                      onChange={(event) => updateItemValue(itemKey, event.target.value)}
                      onKeyDown={(event) => handleManualInputKeyDown(event, itemKey)}
                      placeholder={!answers[itemKey]?.trim() ? hintPreview || undefined : undefined}
                      value={answers[itemKey] ?? ""}
                    />
                    {inlineHint ? <span className="playsay-inline-hint-ghost">{inlineHint}</span> : null}
                    <button
                      aria-label={t("materials.renderer.checkAnswer")}
                      className="playsay-inline-check"
                      disabled={status.locked || status.correct || !answers[itemKey]?.trim()}
                      onClick={() => checkItem(itemKey)}
                      title={t("materials.renderer.checkAnswerTitle")}
                      type="button"
                    >
                      <CornerDownLeft className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <MaterialAttemptBar status={status} />
                  <MaterialAnswerTools
                    canRequestHint={canRequestHint}
                    onHint={() => requestHint(itemKey, item)}
                    status={status}
                  />
                </span>
              )}
            </label>
          </div>
        );
      })}
    </div>
  );
}
