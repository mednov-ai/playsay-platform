import { useEffect, useState } from "react";
import { LayoutGrid, Plus } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";
import {
  type MaterialAssetLibraryItem,
  type MaterialEditorBlock,
  type MaterialFormState,
  type MaterialImageGenerationProgress,
} from "../model/materialDocument";
import { MaterialBlockEditor } from "./MaterialBlockEditor";
import { MaterialImageProgress } from "./MaterialImageProgress";
import { resetMaterialBlockCollapse, toggleMaterialBlockCollapse } from "./materialEditorCollapse";

export function MaterialEditorForm({
  activeBlockId,
  assetLibrary,
  canSuggestAcceptedAnswers,
  disabled,
  form,
  imageGenerationProgress,
  message,
  onActivateBlock,
  onMoveBlock,
  onRemoveBlock,
  onRequestPalette,
  onSuggestAcceptedAnswers,
  onUpdateBlock,
  onUploadBlockAsset,
}: {
  activeBlockId: string | null;
  assetLibrary: MaterialAssetLibraryItem[];
  canSuggestAcceptedAnswers: boolean;
  disabled: boolean;
  form: MaterialFormState;
  imageGenerationProgress: MaterialImageGenerationProgress | null;
  message: string | null;
  onActivateBlock: (blockId: string) => void;
  onMoveBlock: (blockId: string, direction: -1 | 1) => void;
  onRemoveBlock: (blockId: string) => void;
  onRequestPalette: () => void;
  onSuggestAcceptedAnswers: (blockId: string, itemIds: string[]) => void;
  onUpdateBlock: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
  onUploadBlockAsset: (blockId: string, kind: "image" | "htmlGame", file: File) => Promise<void>;
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
      <section aria-label={t("materials.editor.canvasAria")} className="playsay-material-canvas">
        <div className="playsay-material-canvas-head">
          <div>
            <span className="inline-flex items-center gap-2 text-sm font-extrabold">
              <LayoutGrid className="h-4 w-4 text-primary" />
              {t("materials.editor.canvasTitle")}
            </span>
            <p>{t("materials.editor.canvasHint")}</p>
          </div>
          <Button className="playsay-material-mobile-add" disabled={disabled} onClick={onRequestPalette} type="button" variant="outline">
            <Plus className="h-4 w-4" />
            {t("materials.editor.addBlock")}
          </Button>
        </div>

        <div className="playsay-material-editor">
          {blocks.length === 0 ? (
            <div className="playsay-material-empty-canvas">
              <span className="playsay-material-empty-icon"><Plus className="h-6 w-6" /></span>
              <h2>{t("materials.editor.emptyTitle")}</h2>
              <p>{t("materials.editor.emptyDescription")}</p>
              <Button disabled={disabled} onClick={onRequestPalette} type="button">
                <Plus className="h-4 w-4" />
                {t("materials.editor.addFirstBlock")}
              </Button>
            </div>
          ) : (
            blocks.map((block, index) => (
              <MaterialBlockEditor
                active={activeBlockId === block.id}
                assetLibrary={assetLibrary}
                block={block}
                canMoveDown={index < blocks.length - 1}
                canMoveUp={index > 0}
                canSuggestAcceptedAnswers={canSuggestAcceptedAnswers}
                collapsed={collapsedBlockIds.has(block.id)}
                currentMaterialId={form.id}
                disabled={disabled}
                index={index}
                key={block.id}
                onActivate={() => onActivateBlock(block.id)}
                onMoveDown={() => onMoveBlock(block.id, 1)}
                onMoveUp={() => onMoveBlock(block.id, -1)}
                onRemove={() => onRemoveBlock(block.id)}
                onSuggestAcceptedAnswers={onSuggestAcceptedAnswers}
                onToggleCollapsed={() => toggleBlockCollapsed(block.id)}
                onUpdate={(patch) => onUpdateBlock(block.id, patch)}
                onUploadAsset={(kind, file) => onUploadBlockAsset(block.id, kind, file)}
              />
            ))
          )}
        </div>
      </section>

      {imageGenerationProgress ? <MaterialImageProgress value={imageGenerationProgress} /> : null}
      {message ? (
        <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
          {message}
        </div>
      ) : null}
    </>
  );
}
