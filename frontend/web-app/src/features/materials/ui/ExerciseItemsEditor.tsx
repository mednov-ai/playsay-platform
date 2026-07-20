import { useRef } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { FormField } from "../../../shared/ui/FormField";
import {
  FILL_GAP_MARKER,
  createClientId,
  formatMaterialList,
  materialAcceptedAnswersWithCandidate,
  materialExerciseItemKey,
  materialFillGapMode,
  materialItemThreadRootId,
  materialPromptRows,
  materialPromptWithInsertedGapMarker,
  splitMaterialList,
  type MaterialEditorBlock,
  type MaterialExerciseItem,
  type MaterialFillGapMode,
  type MaterialWordBankOption,
} from "../model/materialDocument";
import { AcceptedAnswersField } from "./AcceptedAnswersField";
import { ExerciseItemsToolbar } from "./ExerciseItemsToolbar";
import { ExerciseItemSuggestions } from "./ExerciseItemSuggestions";
import { ThreadConnector } from "./ThreadConnector";
import { useAppTranslation } from "../../../shared/i18n";
import { WordBankOptionsEditor } from "./WordBankOptionsEditor";

export function ExerciseItemsEditor({
  block,
  canSuggestAcceptedAnswers,
  disabled,
  onSuggestAcceptedAnswers,
  onUpdate,
}: {
  block: MaterialEditorBlock;
  canSuggestAcceptedAnswers: boolean;
  disabled: boolean;
  onSuggestAcceptedAnswers?: (blockId: string, itemIds: string[]) => void;
  onUpdate: (patch: Partial<MaterialEditorBlock>) => void;
}) {
  const { t } = useAppTranslation();
  const items = block.items ?? [];
  const canSuggest = Boolean(onSuggestAcceptedAnswers && canSuggestAcceptedAnswers && items.length > 0);
  const promptInputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const hasWordBankItems = block.type === "fillGaps" && items.some((item) => materialFillGapMode(item) === "wordBank");
  const wordBankOptions = block.wordBankOptions ?? [];

  function updateItem(index: number, patch: Partial<MaterialExerciseItem>) {
    onUpdate({
      items: items.map((item, itemIndex) => (
        itemIndex === index ? { ...item, ...patch } : item
      )),
    });
  }

  function createExerciseItem(patch: Partial<MaterialExerciseItem> = {}): MaterialExerciseItem {
    return {
      id: createClientId("item"),
      prompt: "",
      answer: "",
      acceptedAnswers: [],
      options: block.type === "multipleChoice" || patch.gapMode === "singleChoice" ? ["", "", ""] : [],
      ...patch,
    };
  }

  function addItem() {
    onUpdate({
      items: [...items, createExerciseItem()],
    });
  }

  function insertItemAfter(index: number) {
    const item = items[index];
    if (!item) {
      return;
    }
    const rootItemId = item.threadRootItemId ?? item.id ?? createClientId("item");
    const currentItem = item.id ? item : { ...item, id: rootItemId };

    onUpdate({
      items: items.flatMap((candidate, itemIndex) => {
        if (itemIndex !== index) {
          return [candidate];
        }

        return [
          currentItem,
          createExerciseItem({
            gapMode: block.type === "fillGaps" ? materialFillGapMode(currentItem) : undefined,
            threadRootItemId: rootItemId,
          }),
        ];
      }),
    });
  }

  function setItemGapMode(index: number, gapMode: MaterialFillGapMode) {
    const item = items[index];
    if (!item) {
      return;
    }

    if (gapMode === "wordBank") {
      const matchingOption = wordBankOptions.find((option) => option.value.trim() && option.value.trim() === item.answer?.trim());
      const createdOption = matchingOption ?? (item.answer?.trim()
        ? { id: createClientId("bank"), value: item.answer.trim() }
        : null);
      onUpdate({
        items: items.map((candidate, itemIndex) => (
          itemIndex === index
            ? {
              ...candidate,
              acceptedAnswers: [],
              answerOptionId: createdOption?.id,
              gapMode,
              hintCount: undefined,
              maxAttempts: undefined,
              maxErrors: candidate.maxErrors ?? 3,
              options: [],
            }
            : candidate
        )),
        wordBankOptions: createdOption && !matchingOption
          ? [...wordBankOptions, createdOption]
          : wordBankOptions,
      });
      return;
    }

    updateItem(index, {
      answerOptionId: undefined,
      baseForm: gapMode === "formTransform" ? item.baseForm ?? item.answer ?? "" : undefined,
      gapMode: gapMode === "typed" ? undefined : gapMode,
      hintCount: gapMode === "typed" ? item.hintCount ?? 3 : undefined,
      hintPrefixLength: gapMode === "typed" ? item.hintPrefixLength : undefined,
      maxAttempts: gapMode === "typed" || gapMode === "formTransform" ? item.maxAttempts ?? 5 : undefined,
      maxErrors: undefined,
      options: gapMode === "singleChoice" ? (item.options?.length ? item.options : ["", "", ""]) : [],
    });
  }

  function addWordBankOption() {
    onUpdate({
      wordBankOptions: [...wordBankOptions, { id: createClientId("bank"), value: "" }],
    });
  }

  function updateWordBankOption(optionId: string, patch: Partial<MaterialWordBankOption>) {
    const nextOptions = wordBankOptions.map((option) => (
      option.id === optionId ? { ...option, ...patch } : option
    ));
    const nextOption = nextOptions.find((option) => option.id === optionId);
    onUpdate({
      wordBankOptions: nextOptions,
      items: items.map((item) => (
        item.answerOptionId === optionId ? { ...item, answer: nextOption?.value ?? item.answer } : item
      )),
    });
  }

  function removeWordBankOption(optionId: string) {
    onUpdate({
      wordBankOptions: wordBankOptions.filter((option) => option.id !== optionId),
      items: items.map((item) => (
        item.answerOptionId === optionId ? { ...item, answerOptionId: undefined } : item
      )),
    });
  }

  function setWordBankAnswer(index: number, optionId: string) {
    const option = wordBankOptions.find((candidate) => candidate.id === optionId);
    updateItem(index, {
      answer: option?.value ?? "",
      answerOptionId: option?.id,
    });
  }

  function insertGapMarker(index: number) {
    const item = items[index];
    if (!item) {
      return;
    }
    const itemKey = item.id ?? `${index}`;
    const input = promptInputRefs.current[itemKey];
    const nextPrompt = materialPromptWithInsertedGapMarker(item.prompt, input?.selectionStart, input?.selectionEnd);
    updateItem(index, { prompt: nextPrompt.prompt });

    globalThis.requestAnimationFrame?.(() => {
      const nextInput = promptInputRefs.current[itemKey];
      nextInput?.focus();
      nextInput?.setSelectionRange(nextPrompt.cursor, nextPrompt.cursor);
    });
  }

  function removeItem(index: number) {
    const removedItemId = items[index]?.id;
    onUpdate({
      items: items
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item) => (removedItemId && item.threadRootItemId === removedItemId ? { ...item, threadRootItemId: undefined } : item)),
    });
  }

  function acceptSuggestion(index: number, suggestionValue: string) {
    const item = items[index];
    const acceptedAnswers = materialAcceptedAnswersWithCandidate(item.acceptedAnswers ?? [], item.answer, suggestionValue);
    updateItem(index, {
      acceptedAnswers,
      aiSuggestedAnswers: (item.aiSuggestedAnswers ?? []).filter((suggestion) => suggestion.value !== suggestionValue),
    });
  }

  function rejectSuggestion(index: number, suggestionValue: string) {
    const item = items[index];
    updateItem(index, {
      aiSuggestedAnswers: (item.aiSuggestedAnswers ?? []).filter((suggestion) => suggestion.value !== suggestionValue),
    });
  }

  function suggestBlockAnswers() {
    onSuggestAcceptedAnswers?.(block.id, items.map((item, index) => materialExerciseItemKey(item, index)));
  }

  function suggestSentenceAnswers(index: number) {
    const threadRootItemId = materialItemThreadRootId(items[index], index);
    const threadItemIds = items
      .map((item, itemIndex) => ({
        itemId: materialExerciseItemKey(item, itemIndex),
        threadRootItemId: materialItemThreadRootId(item, itemIndex),
      }))
      .filter((item) => item.threadRootItemId === threadRootItemId)
      .map((item) => item.itemId);
    onSuggestAcceptedAnswers?.(block.id, threadItemIds.length ? threadItemIds : [materialExerciseItemKey(items[index], index)]);
  }

  return (
    <div className="grid gap-2">
      <ExerciseItemsToolbar
        blockType={block.type}
        canSuggest={canSuggest}
        canSuggestAcceptedAnswers={canSuggestAcceptedAnswers}
        disabled={disabled}
        onAddItem={addItem}
        onSuggestBlockAnswers={suggestBlockAnswers}
      />

      {hasWordBankItems ? (
        <WordBankOptionsEditor
          disabled={disabled}
          onAdd={addWordBankOption}
          onRemove={removeWordBankOption}
          onUpdate={updateWordBankOption}
          options={wordBankOptions}
        />
      ) : null}

      {items.map((item, index) => {
        const itemKey = item.id ?? `${index}`;
        const gapMode = block.type === "fillGaps" ? materialFillGapMode(item) : "singleChoice";
        const threadRootItemId = materialItemThreadRootId(item, index);
        const nextItem = items[index + 1];
        const nextThreadRootItemId = nextItem ? materialItemThreadRootId(nextItem, index + 1) : null;
        const isContinuation = Boolean(item.threadRootItemId);
        const hasNextInThread = Boolean(nextItem && nextThreadRootItemId === threadRootItemId);
        const isThreadTail = !hasNextInThread;
        return (
        <div className="grid gap-1" key={item.id ?? `${block.id}-${index}`}>
          <div className={isContinuation ? "grid grid-cols-[1.5rem_minmax(0,1fr)] gap-1.5" : ""}>
            {isContinuation ? <ThreadConnector /> : null}
            <div className="grid gap-1.5 rounded-lg border border-border bg-muted/20 p-2">
          <div className="playsay-exercise-item-fields" data-block-type={block.type}>
            {block.type === "fillGaps" ? (
              <FormField label={t("materials.blockEditor.gapMode")}>
                <select
                  className="playsay-input"
                  disabled={disabled}
                  onChange={(event) => setItemGapMode(index, event.target.value as MaterialFillGapMode)}
                  value={gapMode}
                >
                  <option value="typed">{t("materials.blockEditor.gapModeTyped")}</option>
                  <option value="singleChoice">{t("materials.blockEditor.gapModeSingleChoice")}</option>
                  <option value="wordBank">{t("materials.blockEditor.gapModeWordBank")}</option>
                  <option value="formTransform">{t("materials.blockEditor.gapModeFormTransform")}</option>
                </select>
              </FormField>
            ) : null}
            <FormField label={t("materials.blockEditor.itemPrompt")}>
              <div className="flex items-start gap-1.5">
                <textarea
                  className="playsay-input min-h-10 min-w-0 flex-1 resize-y py-2"
                  disabled={disabled}
                  onChange={(event) => updateItem(index, { prompt: event.target.value })}
                  ref={(node) => {
                    promptInputRefs.current[itemKey] = node;
                  }}
                  rows={materialPromptRows(item.prompt)}
                  value={item.prompt}
                />
                {block.type === "fillGaps" ? (
                  <Button
                    aria-label={t("materials.blockEditor.insertGapMarkerAria", { marker: FILL_GAP_MARKER })}
                    className="h-9 w-9 shrink-0 px-0 text-base font-black"
                    disabled={disabled}
                    onClick={() => insertGapMarker(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    title={t("materials.blockEditor.insertGapMarkerTitle", { marker: FILL_GAP_MARKER })}
                    type="button"
                    variant="outline"
                  >
                    <span aria-hidden="true">{FILL_GAP_MARKER}</span>
                  </Button>
                ) : null}
              </div>
            </FormField>
            <FormField label={gapMode === "wordBank" ? t("materials.blockEditor.correctWordBankOption") : t("materials.blockEditor.primaryAnswer")}>
              {gapMode === "wordBank" ? (
                <select
                  className="playsay-input"
                  disabled={disabled}
                  onChange={(event) => setWordBankAnswer(index, event.target.value)}
                  value={item.answerOptionId ?? ""}
                >
                  <option value="">{t("materials.blockEditor.selectWordBankOption")}</option>
                  {wordBankOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.value || t("materials.blockEditor.emptyWordBankOption")}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="playsay-input"
                  disabled={disabled}
                  onChange={(event) => updateItem(index, { answer: event.target.value })}
                  value={item.answer ?? ""}
                />
              )}
            </FormField>
            {gapMode === "formTransform" ? (
              <FormField label={t("materials.blockEditor.baseForm")}>
                <input
                  className="playsay-input"
                  disabled={disabled}
                  onChange={(event) => updateItem(index, { baseForm: event.target.value })}
                  value={item.baseForm ?? ""}
                />
              </FormField>
            ) : null}
            {gapMode === "typed" ? (
              <FormField label={t("materials.blockEditor.hintPrefix")}>
                <select
                  className="playsay-input"
                  disabled={disabled}
                  onChange={(event) => updateItem(index, { hintPrefixLength: Number(event.target.value) || undefined })}
                  value={item.hintPrefixLength ?? 0}
                >
                  <option value={0}>{t("materials.blockEditor.hintPrefixNone")}</option>
                  <option value={1}>{t("materials.blockEditor.hintPrefixOne")}</option>
                  <option value={2}>{t("materials.blockEditor.hintPrefixTwo")}</option>
                </select>
              </FormField>
            ) : null}
            {block.type === "multipleChoice" || gapMode === "singleChoice" ? (
              <FormField label={t("materials.blockEditor.options")}>
                <input
                  className="playsay-input"
                  disabled={disabled}
                  onChange={(event) => updateItem(index, { options: splitMaterialList(event.target.value).map((value) => value.trim()).filter(Boolean) })}
                  value={formatMaterialList(item.options) ?? ""}
                />
              </FormField>
            ) : null}
            {block.type === "fillGaps" && gapMode !== "singleChoice" ? (
              <FormField label={gapMode === "wordBank" ? t("materials.blockEditor.itemErrors") : t("materials.blockEditor.itemAttempts")}>
                <input
                  className="playsay-input"
                  disabled={disabled}
                  max={10}
                  min={1}
                  onChange={(event) => updateItem(index, gapMode === "wordBank"
                    ? { maxErrors: Number(event.target.value) || undefined }
                    : { maxAttempts: Number(event.target.value) || undefined })}
                  type="number"
                  value={gapMode === "wordBank" ? item.maxErrors ?? 3 : item.maxAttempts ?? 5}
                />
              </FormField>
            ) : null}
            {block.type === "fillGaps" && gapMode === "typed" ? (
              <FormField label={t("materials.blockEditor.itemHints")}>
                <input
                  className="playsay-input"
                  disabled={disabled}
                  max={5}
                  min={3}
                  onChange={(event) => updateItem(index, { hintCount: Number(event.target.value) || undefined })}
                  type="number"
                  value={item.hintCount ?? 3}
                />
              </FormField>
            ) : null}
            {block.type !== "fillGaps" ? (
              <FormField label={t("materials.blockEditor.itemWeight")}>
                <input
                  className="playsay-input"
                  disabled={disabled}
                  min={0.1}
                  onChange={(event) => updateItem(index, { weight: Number(event.target.value) || undefined })}
                  step={0.1}
                  type="number"
                  value={item.weight ?? ""}
                />
              </FormField>
            ) : null}
            <div className="flex items-end">
              <Button
                aria-label={t("materials.blockEditor.removeItem")}
                className="h-9 w-9 px-0"
                disabled={disabled}
                onClick={() => removeItem(index)}
                title={t("materials.blockEditor.removeItem")}
                type="button"
                variant="outline"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {gapMode === "typed" || gapMode === "formTransform" ? (
          <div className="grid gap-1">
            <div className="flex items-center justify-between gap-2 text-xs font-extrabold text-muted-foreground">
              <span>{t("materials.blockEditor.acceptedAnswers")}</span>
              {block.type === "fillGaps" ? (
                <Button
                  aria-label={t("materials.blockEditor.suggestSentenceAnswers")}
                  className="h-7 w-7 px-0"
                  disabled={disabled || !canSuggest}
                  onClick={() => suggestSentenceAnswers(index)}
                  title={!canSuggestAcceptedAnswers ? t("materials.blockEditor.suggestAnswersSaveRequired") : t("materials.blockEditor.suggestSentenceAnswers")}
                  type="button"
                  variant="outline"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
            <AcceptedAnswersField
              acceptedAnswers={item.acceptedAnswers ?? []}
              disabled={disabled}
              onChange={(acceptedAnswers) => updateItem(index, { acceptedAnswers })}
              primaryAnswer={item.answer}
            />
          </div>
          ) : null}
          <ExerciseItemSuggestions
            disabled={disabled}
            item={item}
            onAccept={(suggestionValue) => acceptSuggestion(index, suggestionValue)}
            onReject={(suggestionValue) => rejectSuggestion(index, suggestionValue)}
          />
            </div>
          </div>
          {!isContinuation && hasNextInThread ? (
            <span aria-hidden="true" className="ml-3 h-1.5 w-px bg-border" />
          ) : null}
          {block.type === "fillGaps" && isThreadTail ? (
            <div className={isContinuation ? "grid grid-cols-[1.5rem_minmax(0,1fr)] gap-1.5" : "flex items-center gap-2 pl-2"}>
              {isContinuation ? <ThreadConnector compact /> : <span aria-hidden="true" className="h-px w-5 bg-border" />}
              <Button
                aria-label={t("materials.blockEditor.continueSentenceAria")}
                className="h-7 w-fit rounded-full px-2 text-xs"
                disabled={disabled}
                onClick={() => insertItemAfter(index)}
                type="button"
                variant="outline"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("materials.blockEditor.continueSentence")}
              </Button>
            </div>
          ) : null}
        </div>
        );
      })}
    </div>
  );
}
