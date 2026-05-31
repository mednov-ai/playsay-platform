import { useEffect, useState } from "react";
import { Archive, Copy, Eye, Save, Sparkles } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { FormField } from "../../../shared/ui/FormField";
import {
  materialBlockLabel,
  type MaterialAssetLibraryItem,
  type MaterialBlockType,
  type MaterialEditorBlock,
  type MaterialFormState,
  type MaterialImageGenerationProgress,
} from "../model/materialDocument";
import { MaterialBlockEditor } from "./MaterialBlockEditor";
import { MaterialImageProgress } from "./MaterialImageProgress";
import { materialBlockIcon } from "./materialBlockIcon";
import { useAppTranslation } from "../../../shared/i18n";
import { resetMaterialBlockCollapse, toggleMaterialBlockCollapse } from "./materialEditorCollapse";

export function MaterialEditorForm({
  assetLibrary,
  canSuggestAcceptedAnswers,
  canGenerateImages,
  disabled,
  form,
  imageGenerationProgress,
  message,
  onAddBlock,
  onArchive,
  onDuplicate,
  onGenerateCurrentImages,
  onPreview,
  onRemoveBlock,
  onSuggestAcceptedAnswers,
  onUpdateBlock,
  onUpdateForm,
  pendingImageTargetsCount,
}: {
  assetLibrary: MaterialAssetLibraryItem[];
  canSuggestAcceptedAnswers: boolean;
  canGenerateImages: boolean;
  disabled: boolean;
  form: MaterialFormState;
  imageGenerationProgress: MaterialImageGenerationProgress | null;
  message: string | null;
  onAddBlock: (type: MaterialBlockType) => void;
  onArchive: (materialId: string) => void;
  onDuplicate: () => void;
  onGenerateCurrentImages: () => void;
  onPreview: () => void;
  onRemoveBlock: (blockId: string) => void;
  onSuggestAcceptedAnswers: (blockId: string, itemIds: string[]) => void;
  onUpdateBlock: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
  onUpdateForm: <Key extends keyof MaterialFormState>(field: Key, value: MaterialFormState[Key]) => void;
  pendingImageTargetsCount: number;
}) {
  const { t } = useAppTranslation();
  const [collapsedBlockIds, setCollapsedBlockIds] = useState<Set<string>>(() => new Set());
  const blocks = form.document.pages[0]?.blocks ?? [];

  useEffect(() => {
    setCollapsedBlockIds(resetMaterialBlockCollapse());
  }, [form.id]);

  function toggleBlockCollapsed(blockId: string) {
    setCollapsedBlockIds((current) => toggleMaterialBlockCollapse(current, blockId));
  }

  return (
    <>
      <div className="rounded-2xl border border-border bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_7rem_8rem_8rem]">
          <FormField label={t("materials.form.title")}>
            <input
              className="playsay-input"
              disabled={disabled}
              maxLength={160}
              onChange={(event) => onUpdateForm("title", event.target.value)}
              required
              value={form.title}
            />
          </FormField>
          <FormField label={t("materials.form.level")}>
            <select
              className="playsay-input"
              disabled={disabled}
              onChange={(event) => onUpdateForm("cefrLevel", event.target.value)}
              value={form.cefrLevel}
            >
              {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </FormField>
          <FormField label={t("materials.form.visibility")}>
            <select
              className="playsay-input"
              disabled={disabled}
              onChange={(event) => onUpdateForm("visibility", event.target.value as MaterialFormState["visibility"])}
              value={form.visibility}
            >
              <option value="PRIVATE">{t("materials.form.visibilityPrivate")}</option>
              <option value="PUBLIC">{t("materials.form.visibilityPublic")}</option>
            </select>
          </FormField>
          <FormField label={t("materials.form.status")}>
            <select
              className="playsay-input"
              disabled={disabled}
              onChange={(event) => onUpdateForm("status", event.target.value as MaterialFormState["status"])}
              value={form.status}
            >
              <option value="DRAFT">{t("materials.form.statusDraft")}</option>
              <option value="PUBLISHED">{t("materials.form.statusPublished")}</option>
            </select>
          </FormField>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[8rem_minmax(0,1fr)]">
          <FormField label={t("materials.form.language")}>
            <input
              className="playsay-input"
              disabled={disabled}
              maxLength={16}
              onChange={(event) => onUpdateForm("language", event.target.value)}
              value={form.language}
            />
          </FormField>
          <FormField label={t("materials.form.description")}>
            <input
              className="playsay-input"
              disabled={disabled}
              maxLength={2_000}
              onChange={(event) => onUpdateForm("description", event.target.value)}
              placeholder={t("materials.form.descriptionPlaceholder")}
              value={form.description}
            />
          </FormField>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {(["text", "videoEmbed", "image", "generatedImage", "flashcards", "fillGaps", "multipleChoice", "matchingPairs", "freeWriting", "speakingPrompt", "drawingArea"] as MaterialBlockType[]).map((type) => (
              <Button disabled={disabled} key={type} onClick={() => onAddBlock(type)} type="button" variant="outline">
                {materialBlockIcon(type)}
                {materialBlockLabel(type)}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button disabled={disabled || form.title.trim().length === 0} onClick={onDuplicate} type="button" variant="outline">
              <Copy className="h-4 w-4" />
              {t("materials.actions.duplicate")}
            </Button>
            <Button disabled={disabled || form.title.trim().length === 0} onClick={onPreview} type="button" variant="outline">
              <Eye className="h-4 w-4" />
              {t("materials.actions.preview")}
            </Button>
            <Button disabled={disabled || !canGenerateImages || form.title.trim().length === 0} onClick={onGenerateCurrentImages} type="button" variant="outline">
              <Sparkles className="h-4 w-4" />
              {pendingImageTargetsCount > 0
                ? t("materials.actions.generateWithCount", { count: pendingImageTargetsCount })
                : t("materials.actions.generate")}
            </Button>
            {form.id ? (
              <Button disabled={disabled} onClick={() => onArchive(form.id!)} type="button" variant="outline">
                <Archive className="h-4 w-4" />
                {t("materials.actions.archive")}
              </Button>
            ) : null}
            <Button disabled={disabled || form.title.trim().length === 0} type="submit">
              <Save className="h-4 w-4" />
              {t("materials.actions.save")}
            </Button>
          </div>
        </div>
        {imageGenerationProgress ? (
          <MaterialImageProgress value={imageGenerationProgress} />
        ) : null}
      </div>

      <div className="playsay-material-editor">
        {blocks.length === 0 ? (
          <div className="rounded-2xl border border-border bg-muted/60 p-4 text-sm font-semibold text-muted-foreground">
            {t("materials.form.emptyBlocks")}
          </div>
        ) : (
          blocks.map((block, index) => (
            <MaterialBlockEditor
              assetLibrary={assetLibrary}
              block={block}
              canSuggestAcceptedAnswers={canSuggestAcceptedAnswers}
              collapsed={collapsedBlockIds.has(block.id)}
              currentMaterialId={form.id}
              disabled={disabled}
              index={index}
              key={block.id}
              onRemove={() => onRemoveBlock(block.id)}
              onSuggestAcceptedAnswers={onSuggestAcceptedAnswers}
              onToggleCollapsed={() => toggleBlockCollapsed(block.id)}
              onUpdate={(patch) => onUpdateBlock(block.id, patch)}
            />
          ))
        )}
      </div>

      {message ? (
        <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
          {message}
        </div>
      ) : null}
    </>
  );
}
