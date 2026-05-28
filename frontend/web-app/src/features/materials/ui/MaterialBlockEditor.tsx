import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { FormField } from "../../../shared/ui/FormField";
import {
  defaultObjectiveAssessmentPolicy,
  formatExerciseItems,
  formatFlashcards,
  isObjectiveMaterialBlockType,
  materialBlockLabel,
  parseExerciseItems,
  parseFlashcards,
  type MaterialAssetLibraryItem,
  type MaterialEditorBlock,
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
  onUpdate,
}: {
  assetLibrary: MaterialAssetLibraryItem[];
  block: MaterialEditorBlock;
  currentMaterialId: string | null;
  disabled: boolean;
  index: number;
  onRemove: () => void;
  onUpdate: (patch: Partial<MaterialEditorBlock>) => void;
}) {
  const { t } = useAppTranslation();
  const exerciseType = block.type === "multipleChoice" ? "multipleChoice" : "fillGaps";
  const [flashcardsSource, setFlashcardsSource] = useState(() => formatFlashcards(block.cards));
  const [exerciseSource, setExerciseSource] = useState(() => formatExerciseItems(block.items, exerciseType));

  useEffect(() => {
    setFlashcardsSource(formatFlashcards(block.cards));
    setExerciseSource(formatExerciseItems(block.items, exerciseType));
  }, [block.id, block.type, exerciseType]);

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
            <FormField label={block.type === "generatedImage" ? "Prompt" : t("materials.blockEditor.imageUrl")}>
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
          <textarea
            className="playsay-input min-h-28 resize-y py-3"
            disabled={disabled}
            onChange={(event) => {
              const value = event.target.value;
              setExerciseSource(value);
              onUpdate({ items: parseExerciseItems(value, exerciseType) });
            }}
            value={exerciseSource}
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
