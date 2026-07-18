import { useEffect, useRef, useState } from "react";
import { LayoutGrid, Plus } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";
import type { MaterialHtmlGameEnrichment } from "../../../shared/api/playsay";
import {
  type MaterialAssetLibraryItem,
  type MaterialEditorBlock,
  type MaterialFormState,
  type MaterialImageGenerationProgress,
} from "../model/materialDocument";
import { MaterialBlockEditor } from "./MaterialBlockEditor";
import { MaterialBlockHoverPreview } from "./MaterialBlockHoverPreview";
import { MaterialImageProgress } from "./MaterialImageProgress";
import { resetExpandedMaterialBlock, toggleExpandedMaterialBlock } from "./materialEditorCollapse";

export function MaterialEditorForm({
  activeBlockId,
  assetLibrary,
  canSuggestAcceptedAnswers,
  disabled,
  form,
  imageGenerationProgress,
  htmlGameEnrichments,
  message,
  onActivateBlock,
  onMoveBlock,
  onRegenerateHtmlGameIcon,
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
  htmlGameEnrichments: Record<string, MaterialHtmlGameEnrichment>;
  message: string | null;
  onActivateBlock: (blockId: string) => void;
  onMoveBlock: (blockId: string, direction: -1 | 1) => void;
  onRegenerateHtmlGameIcon: (blockId: string) => void;
  onRemoveBlock: (blockId: string) => void;
  onRequestPalette: () => void;
  onSuggestAcceptedAnswers: (blockId: string, itemIds: string[]) => void;
  onUpdateBlock: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
  onUploadBlockAsset: (blockId: string, kind: "image" | "htmlGame", file: File) => Promise<void>;
}) {
  const { t } = useAppTranslation();
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(() => resetExpandedMaterialBlock());
  const [previewBlockId, setPreviewBlockId] = useState<string | null>(null);
  const blocks = form.document.pages[0]?.blocks ?? [];
  const blockIdsKey = blocks.map((block) => block.id).join("|");
  const previousBlockIdsRef = useRef<Set<string>>(new Set(blocks.map((block) => block.id)));

  useEffect(() => {
    setExpandedBlockId(resetExpandedMaterialBlock());
    setPreviewBlockId(null);
    previousBlockIdsRef.current = new Set(blocks.map((block) => block.id));
  }, [form.id]);

  useEffect(() => {
    const previousIds = previousBlockIdsRef.current;
    const addedBlock = blocks.find((block) => !previousIds.has(block.id));
    previousBlockIdsRef.current = new Set(blocks.map((block) => block.id));
    if (addedBlock) {
      setExpandedBlockId(addedBlock.id);
      setPreviewBlockId(addedBlock.id);
    }
  }, [blockIdsKey]);

  const previewBlock = blocks.find((block) => block.id === (previewBlockId ?? expandedBlockId)) ?? null;

  return (
    <>
      <div className="playsay-material-author-stage">
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
                  collapsed={expandedBlockId !== block.id}
                  currentMaterialId={form.id}
                  disabled={disabled}
                  index={index}
                  htmlGameEnrichment={htmlGameEnrichments[block.id]}
                  key={block.id}
                  onActivate={() => onActivateBlock(block.id)}
                  onPreview={() => setPreviewBlockId(block.id)}
                  onPreviewEnd={() => setPreviewBlockId((current) => current === block.id ? null : current)}
                  onMoveDown={() => onMoveBlock(block.id, 1)}
                  onMoveUp={() => onMoveBlock(block.id, -1)}
                  onRegenerateHtmlGameIcon={() => onRegenerateHtmlGameIcon(block.id)}
                  onRemove={() => onRemoveBlock(block.id)}
                  onSuggestAcceptedAnswers={onSuggestAcceptedAnswers}
                  onToggleCollapsed={() => setExpandedBlockId((current) => toggleExpandedMaterialBlock(current, block.id))}
                  onUpdate={(patch) => onUpdateBlock(block.id, patch)}
                  onUploadAsset={(kind, file) => onUploadBlockAsset(block.id, kind, file)}
                />
              ))
            )}
          </div>
        </section>
        <MaterialBlockHoverPreview block={previewBlock} form={form} />
      </div>

      {imageGenerationProgress ? <MaterialImageProgress value={imageGenerationProgress} /> : null}
      {message ? (
        <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
          {message}
        </div>
      ) : null}
    </>
  );
}
