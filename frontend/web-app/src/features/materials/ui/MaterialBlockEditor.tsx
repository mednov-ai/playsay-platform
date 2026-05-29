import { useEffect, useState } from "react";
import { Check, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { FormField } from "../../../shared/ui/FormField";
import {
  defaultObjectiveAssessmentPolicy,
  formatFlashcards,
  isObjectiveMaterialBlockType,
  materialBlockLabel,
  parseFlashcards,
  createClientId,
  formatMaterialList,
  materialExerciseItemKey,
  splitMaterialList,
  uniqueMaterialOptions,
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
  currentMaterialId,
  disabled,
  index,
  onRemove,
  onSuggestAcceptedAnswers,
  onUpdate,
}: {
  assetLibrary: MaterialAssetLibraryItem[];
  block: MaterialEditorBlock;
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
    <article className="rounded-2xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
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
            className="mt-3 w-full border-0 bg-transparent p-0 text-lg font-black outline-none"
            disabled={disabled}
            maxLength={160}
            onChange={(event) => onUpdate({ title: event.target.value })}
            value={block.title}
          />
        </div>
        <Button disabled={disabled} onClick={onRemove} type="button" variant="outline">
          <Trash2 className="h-4 w-4" />
          {t("materials.actions.delete")}
        </Button>
      </div>

      <div className="mt-3 grid gap-3">
        {block.type === "videoEmbed" ? (
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
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
          <div className="grid gap-3 sm:grid-cols-2">
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
          <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-4">
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
  disabled,
  onSuggestAcceptedAnswers,
  onUpdate,
}: {
  block: MaterialEditorBlock;
  disabled: boolean;
  onSuggestAcceptedAnswers?: (blockId: string, itemIds: string[]) => void;
  onUpdate: (patch: Partial<MaterialEditorBlock>) => void;
}) {
  const { t } = useAppTranslation();
  const items = block.items ?? [];
  const canSuggest = Boolean(onSuggestAcceptedAnswers && items.length > 0);

  function updateItem(index: number, patch: Partial<MaterialExerciseItem>) {
    onUpdate({
      items: items.map((item, itemIndex) => (
        itemIndex === index ? { ...item, ...patch } : item
      )),
    });
  }

  function addItem() {
    onUpdate({
      items: [
        ...items,
        {
          id: createClientId("item"),
          prompt: "",
          answer: "",
          acceptedAnswers: [],
          options: block.type === "multipleChoice" ? ["", "", ""] : [],
        },
      ],
    });
  }

  function removeItem(index: number) {
    onUpdate({ items: items.filter((_, itemIndex) => itemIndex !== index) });
  }

  function acceptSuggestion(index: number, suggestionValue: string) {
    const item = items[index];
    const acceptedAnswers = uniqueMaterialOptions([...(item.acceptedAnswers ?? []), suggestionValue])
      .filter((answer) => answer.trim().toLowerCase() !== item.answer?.trim().toLowerCase());
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

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-black uppercase text-muted-foreground">
          {t("materials.blockEditor.exerciseItems")}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={disabled || !canSuggest}
            onClick={() => onSuggestAcceptedAnswers?.(block.id, items.map((item, index) => materialExerciseItemKey(item, index)))}
            type="button"
            variant="outline"
          >
            <Sparkles className="h-4 w-4" />
            {t("materials.blockEditor.suggestAnswers")}
          </Button>
          <Button disabled={disabled} onClick={addItem} type="button" variant="outline">
            <Plus className="h-4 w-4" />
            {t("materials.blockEditor.addItem")}
          </Button>
        </div>
      </div>

      {items.map((item, index) => (
        <div className="grid gap-2 rounded-xl border border-border bg-muted/30 p-3" key={item.id ?? `${item.prompt}-${index}`}>
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(8rem,0.7fr)_minmax(8rem,0.8fr)_5rem_auto]">
            <FormField label={t("materials.blockEditor.itemPrompt")}>
              <input
                className="playsay-input"
                disabled={disabled}
                onChange={(event) => updateItem(index, { prompt: event.target.value })}
                value={item.prompt}
              />
            </FormField>
            <FormField label={t("materials.blockEditor.primaryAnswer")}>
              <input
                className="playsay-input"
                disabled={disabled}
                onChange={(event) => updateItem(index, { answer: event.target.value })}
                value={item.answer ?? ""}
              />
            </FormField>
            <FormField label={t("materials.blockEditor.options")}>
              <input
                className="playsay-input"
                disabled={disabled}
                onChange={(event) => updateItem(index, { options: splitMaterialList(event.target.value).map((value) => value.trim()).filter(Boolean) })}
                value={formatMaterialList(item.options) ?? ""}
              />
            </FormField>
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
              <Button disabled={disabled} onClick={() => removeItem(index)} type="button" variant="outline">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <FormField label={t("materials.blockEditor.acceptedAnswers")}>
            <input
              className="playsay-input"
              disabled={disabled}
              onChange={(event) => updateItem(index, { acceptedAnswers: splitMaterialList(event.target.value).map((value) => value.trim()).filter(Boolean) })}
              placeholder={t("materials.blockEditor.acceptedAnswersPlaceholder")}
              value={formatMaterialList(item.acceptedAnswers) ?? ""}
            />
          </FormField>
          {item.aiSuggestedAnswers?.length ? (
            <div className="flex flex-wrap gap-2">
              {item.aiSuggestedAnswers.map((suggestion) => (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-white px-2 py-1 text-xs font-bold text-foreground" key={suggestion.value}>
                  {suggestion.value}
                  <button
                    aria-label={t("materials.blockEditor.acceptSuggestion", { value: suggestion.value })}
                    className="text-primary"
                    disabled={disabled}
                    onClick={() => acceptSuggestion(index, suggestion.value)}
                    title={suggestion.reason}
                    type="button"
                  >
                    <Check className="h-3.5 w-3.5" />
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
      ))}
    </div>
  );
}
