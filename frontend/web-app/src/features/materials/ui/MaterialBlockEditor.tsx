import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Check, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { FormField } from "../../../shared/ui/FormField";
import {
  defaultObjectiveAssessmentPolicy,
  formatFlashcards,
  isObjectiveMaterialBlockType,
  materialAcceptedAnswersWithCandidate,
  materialBlockLabel,
  parseFlashcards,
  createClientId,
  FILL_GAP_MARKER,
  formatMaterialList,
  materialExerciseItemKey,
  materialPromptWithInsertedGapMarker,
  splitMaterialList,
  type MaterialAssetLibraryItem,
  type MaterialEditorBlock,
  type MaterialExerciseItem,
} from "../model/materialDocument";
import { materialBlockIcon } from "./materialBlockIcon";
import { MatchingPairsEditor } from "./MatchingPairsEditor";
import { useAppTranslation } from "../../../shared/i18n";

export function MaterialBlockEditor({
  assetLibrary,
  block,
  canSuggestAcceptedAnswers,
  currentMaterialId,
  disabled,
  index,
  onRemove,
  onSuggestAcceptedAnswers,
  onUpdate,
}: {
  assetLibrary: MaterialAssetLibraryItem[];
  block: MaterialEditorBlock;
  canSuggestAcceptedAnswers: boolean;
  currentMaterialId: string | null;
  disabled: boolean;
  index: number;
  onRemove: () => void;
  onSuggestAcceptedAnswers?: (blockId: string, itemIds: string[]) => void;
  onUpdate: (patch: Partial<MaterialEditorBlock>) => void;
}) {
  const { t } = useAppTranslation();
  const [flashcardsSource, setFlashcardsSource] = useState(() => formatFlashcards(block.cards));

  useEffect(() => {
    setFlashcardsSource(formatFlashcards(block.cards));
  }, [block.id, block.type]);

  return (
    <article className="rounded-xl border border-border bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-black text-muted-foreground">
              {index + 1}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#fff3eb] px-2 py-1 text-xs font-black text-primary">
              {materialBlockIcon(block.type)}
              {materialBlockLabel(block.type)}
            </span>
          </div>
          <input
            className="mt-2 w-full border-0 bg-transparent p-0 text-base font-black outline-none"
            disabled={disabled}
            maxLength={160}
            onChange={(event) => onUpdate({ title: event.target.value })}
            value={block.title}
          />
        </div>
        <Button className="h-8 px-2 text-xs" disabled={disabled} onClick={onRemove} type="button" variant="outline">
          <Trash2 className="h-4 w-4" />
          {t("materials.actions.delete")}
        </Button>
      </div>

      <div className="mt-2 grid gap-2">
        {block.type === "videoEmbed" ? (
          <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
            <FormField label={t("materials.blockEditor.platform")}>
              <select
                className="playsay-input"
                disabled={disabled}
                onChange={(event) => onUpdate({ provider: event.target.value })}
                value={block.provider ?? "YOUTUBE"}
              >
                <option value="YOUTUBE">YouTube</option>
                <option value="VK">VK</option>
                <option value="RUTUBE">Rutube</option>
              </select>
            </FormField>
            <FormField label={t("materials.blockEditor.link")}>
              <input
                className="playsay-input"
                disabled={disabled}
                onChange={(event) => onUpdate({ url: event.target.value })}
                placeholder="https://..."
                value={block.url ?? ""}
              />
            </FormField>
          </div>
        ) : null}

        {block.type === "image" || block.type === "generatedImage" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <FormField label={block.type === "generatedImage" ? t("materials.blockEditor.prompt") : t("materials.blockEditor.imageUrl")}>
              {block.type === "generatedImage" ? (
                <textarea
                  className="playsay-input min-h-20 resize-y py-3"
                  disabled={disabled}
                  onChange={(event) => onUpdate({ prompt: event.target.value })}
                  placeholder="friendly classroom picture"
                  value={block.prompt ?? ""}
                />
              ) : (
                <input
                  className="playsay-input"
                  disabled={disabled}
                  onChange={(event) => onUpdate({ url: event.target.value })}
                  placeholder="https://..."
                  value={block.url ?? ""}
                />
              )}
            </FormField>
            <FormField label={t("materials.blockEditor.caption")}>
              <textarea
                className="playsay-input min-h-20 resize-y py-3"
                disabled={disabled}
                onChange={(event) => onUpdate({ caption: event.target.value })}
                value={block.caption ?? ""}
              />
            </FormField>
          </div>
        ) : null}

        {block.type === "flashcards" ? (
          <textarea
            className="playsay-input min-h-28 resize-y py-3"
            disabled={disabled}
            onChange={(event) => {
              const value = event.target.value;
              setFlashcardsSource(value);
              onUpdate({ cards: parseFlashcards(value, block.cards) });
            }}
            value={flashcardsSource}
          />
        ) : null}

        {block.type === "fillGaps" || block.type === "multipleChoice" ? (
          <ExerciseItemsEditor
            block={block}
            canSuggestAcceptedAnswers={canSuggestAcceptedAnswers}
            disabled={disabled}
            onSuggestAcceptedAnswers={onSuggestAcceptedAnswers}
            onUpdate={onUpdate}
          />
        ) : null}

        {block.type === "matchingPairs" ? (
          <MatchingPairsEditor
            assetLibrary={assetLibrary}
            block={block}
            currentMaterialId={currentMaterialId}
            disabled={disabled}
            onUpdate={onUpdate}
          />
        ) : null}

        {isObjectiveMaterialBlockType(block.type) ? (
          <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-2 sm:grid-cols-4">
            <FormField label={t("materials.blockEditor.weight")}>
              <input
                className="playsay-input"
                disabled={disabled}
                min={0.1}
                onChange={(event) => onUpdate({ assessment: { ...defaultObjectiveAssessmentPolicy(), ...block.assessment, weight: Number(event.target.value) } })}
                step={0.1}
                type="number"
                value={block.assessment?.weight ?? 1}
              />
            </FormField>
            <FormField label={t("materials.blockEditor.attempts")}>
              <input
                className="playsay-input"
                disabled={disabled}
                min={1}
                max={10}
                onChange={(event) => onUpdate({ assessment: { ...defaultObjectiveAssessmentPolicy(), ...block.assessment, maxAttempts: Number(event.target.value) } })}
                type="number"
                value={block.assessment?.maxAttempts ?? 3}
              />
            </FormField>
            <FormField label={t("materials.blockEditor.attemptPenalty")}>
              <input
                className="playsay-input"
                disabled={disabled}
                min={0}
                max={1}
                onChange={(event) => onUpdate({ assessment: { ...defaultObjectiveAssessmentPolicy(), ...block.assessment, attemptPenalty: Number(event.target.value) } })}
                step={0.05}
                type="number"
                value={block.assessment?.attemptPenalty ?? 0.3}
              />
            </FormField>
            <FormField label={t("materials.blockEditor.hintPenalty")}>
              <input
                className="playsay-input"
                disabled={disabled}
                min={0}
                max={1}
                onChange={(event) => onUpdate({ assessment: { ...defaultObjectiveAssessmentPolicy(), ...block.assessment, hintPenalty: Number(event.target.value) } })}
                step={0.05}
                type="number"
                value={block.assessment?.hintPenalty ?? 0.15}
              />
            </FormField>
          </div>
        ) : null}

        {block.type === "text" || block.type === "freeWriting" || block.type === "speakingPrompt" ? (
          <textarea
            className="playsay-input min-h-28 resize-y py-3"
            disabled={disabled}
            onChange={(event) => onUpdate(block.type === "text" ? { body: event.target.value } : { prompt: event.target.value })}
            value={block.type === "text" ? block.body ?? "" : block.prompt ?? ""}
          />
        ) : null}

        {block.type === "drawingArea" ? (
          <FormField label={t("materials.blockEditor.drawingHeight")}>
            <input
              className="playsay-input"
              disabled={disabled}
              max={800}
              min={120}
              onChange={(event) => onUpdate({ height: Number(event.target.value) })}
              type="number"
              value={block.height ?? 240}
            />
          </FormField>
        ) : null}
      </div>
    </article>
  );
}

function ExerciseItemsEditor({
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
  const promptInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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
      options: block.type === "multipleChoice" ? ["", "", ""] : [],
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
          createExerciseItem({ threadRootItemId: rootItemId }),
        ];
      }),
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
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="text-xs font-black uppercase text-muted-foreground">
          {t("materials.blockEditor.exerciseItems")}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            className="h-8 px-2 text-xs"
            disabled={disabled || !canSuggest}
            onClick={suggestBlockAnswers}
            title={!canSuggestAcceptedAnswers ? t("materials.blockEditor.suggestAnswersSaveRequired") : undefined}
            type="button"
            variant="outline"
          >
            <Sparkles className="h-4 w-4" />
            {t("materials.blockEditor.suggestAnswers")}
          </Button>
          <Button className="h-8 px-2 text-xs" disabled={disabled} onClick={addItem} type="button" variant="outline">
            <Plus className="h-4 w-4" />
            {block.type === "fillGaps" ? t("materials.blockEditor.addGapItem") : t("materials.blockEditor.addItem")}
          </Button>
        </div>
      </div>

      {items.map((item, index) => {
        const itemKey = item.id ?? `${index}`;
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
          <div className={block.type === "fillGaps" ? "grid gap-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(8rem,0.7fr)_4.5rem_2.25rem]" : "grid gap-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(8rem,0.7fr)_minmax(8rem,0.8fr)_4.5rem_2.25rem]"}>
            <FormField label={t("materials.blockEditor.itemPrompt")}>
              <div className="flex gap-1.5">
                <input
                  className="playsay-input min-w-0 flex-1"
                  disabled={disabled}
                  onChange={(event) => updateItem(index, { prompt: event.target.value })}
                  ref={(node) => {
                    promptInputRefs.current[itemKey] = node;
                  }}
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
            <FormField label={t("materials.blockEditor.primaryAnswer")}>
              <input
                className="playsay-input"
                disabled={disabled}
                onChange={(event) => updateItem(index, { answer: event.target.value })}
                value={item.answer ?? ""}
              />
            </FormField>
            {block.type === "multipleChoice" ? (
              <FormField label={t("materials.blockEditor.options")}>
                <input
                  className="playsay-input"
                  disabled={disabled}
                  onChange={(event) => updateItem(index, { options: splitMaterialList(event.target.value).map((value) => value.trim()).filter(Boolean) })}
                  value={formatMaterialList(item.options) ?? ""}
                />
              </FormField>
            ) : null}
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
          {item.aiSuggestedAnswers?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {item.aiSuggestedAnswers.map((suggestion) => (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-white px-2 py-0.5 text-xs font-bold text-foreground" key={suggestion.value}>
                  <button
                    aria-label={t("materials.blockEditor.acceptSuggestion", { value: suggestion.value })}
                    className="inline-flex items-center gap-1 text-primary"
                    disabled={disabled}
                    onClick={() => acceptSuggestion(index, suggestion.value)}
                    title={suggestion.reason || t("materials.blockEditor.acceptSuggestion", { value: suggestion.value })}
                    type="button"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {suggestion.value}
                  </button>
                  <button
                    aria-label={t("materials.blockEditor.rejectSuggestion", { value: suggestion.value })}
                    className="text-muted-foreground"
                    disabled={disabled}
                    onClick={() => rejectSuggestion(index, suggestion.value)}
                    title={t("materials.blockEditor.rejectSuggestion", { value: suggestion.value })}
                    type="button"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
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

function materialItemThreadRootId(item: MaterialExerciseItem, index: number): string {
  return item.threadRootItemId ?? item.id ?? `item-${index}`;
}

function ThreadConnector({ compact = false }: { compact?: boolean }) {
  return (
    <span aria-hidden="true" className="relative min-h-full">
      <span className="absolute left-3 top-0 h-full w-px bg-border" />
      {!compact ? <span className="absolute left-3 top-5 h-px w-3 bg-border" /> : null}
    </span>
  );
}

function AcceptedAnswersField({
  acceptedAnswers,
  disabled,
  onChange,
  primaryAnswer,
}: {
  acceptedAnswers: string[];
  disabled: boolean;
  onChange: (acceptedAnswers: string[]) => void;
  primaryAnswer: string | undefined;
}) {
  const { t } = useAppTranslation();
  const [draft, setDraft] = useState("");

  function commitDraft() {
    const nextAcceptedAnswers = materialAcceptedAnswersWithCandidate(acceptedAnswers, primaryAnswer, draft);
    if (nextAcceptedAnswers.length !== acceptedAnswers.length) {
      onChange(nextAcceptedAnswers);
    }
    setDraft("");
  }

  function removeAcceptedAnswer(answer: string) {
    onChange(acceptedAnswers.filter((candidate) => candidate !== answer));
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    commitDraft();
  }

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-white px-2 py-1">
      {acceptedAnswers.map((answer) => (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#fff3eb] px-2 py-0.5 text-xs font-bold text-primary" key={answer}>
          {answer}
          <button
            aria-label={t("materials.blockEditor.removeAcceptedAnswer", { value: answer })}
            className="text-primary/75"
            disabled={disabled}
            onClick={() => removeAcceptedAnswer(answer)}
            title={t("materials.blockEditor.removeAcceptedAnswer", { value: answer })}
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
      <div className="flex min-w-[10rem] flex-1 items-center gap-1.5">
        <input
          className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none"
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleDraftKeyDown}
          placeholder={t("materials.blockEditor.acceptedAnswerDraftPlaceholder")}
          value={draft}
        />
        <Button
          aria-label={t("materials.blockEditor.addAcceptedAnswer")}
          className="h-7 shrink-0 px-2"
          disabled={disabled || !draft.trim()}
          onClick={commitDraft}
          title={t("materials.blockEditor.addAcceptedAnswer")}
          type="button"
          variant="outline"
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
