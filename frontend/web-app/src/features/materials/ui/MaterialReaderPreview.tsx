import { Archive, Copy, PenLine, Play } from "lucide-react";
import type { LessonMaterialAsset } from "../../../shared/api/playsay";
import { Button } from "../../../components/ui/button";
import {
  materialPreviewFromForm,
  type MaterialEditorBlock,
  type MaterialFormState,
  type MaterialImageGenerationProgress,
} from "../model/materialDocument";
import { LessonMaterialDocumentView } from "./LessonMaterialDocumentView";
import { MaterialImageProgress } from "./MaterialImageProgress";
import { useAppTranslation } from "../../../shared/i18n";

export function MaterialReaderPreview({
  disabled,
  form,
  imageGenerationProgress,
  message,
  onArchive,
  onBlockPatch,
  onBlockPatchCommit,
  onDuplicate,
  onEdit,
  onPlay,
  onUpdateAssetTags,
}: {
  disabled: boolean;
  form: MaterialFormState;
  imageGenerationProgress: MaterialImageGenerationProgress | null;
  message: string | null;
  onArchive: (materialId: string) => void;
  onBlockPatch: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
  onBlockPatchCommit: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onPlay: () => void;
  onUpdateAssetTags: (assetId: string, tags: string[]) => Promise<LessonMaterialAsset | null>;
}) {
  const { t } = useAppTranslation();

  return (
    <>
      <div className="playsay-material-reader-toolbar">
        <div className="min-w-0">
          <div className="truncate text-lg font-extrabold">{form.title}</div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[0.7rem] font-black uppercase text-muted-foreground">
            <span>{form.cefrLevel}</span>
            <span>{form.status}</span>
            <span>{form.visibility}</span>
            <span>{t("materials.library.blocks", { count: form.document.pages[0]?.blocks.length ?? 0 })}</span>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={disabled || form.title.trim().length === 0} onClick={onPlay} type="button">
            <Play className="h-4 w-4" />
            {t("materials.actions.play")}
          </Button>
          <Button disabled={disabled} onClick={onEdit} type="button" variant="outline">
            <PenLine className="h-4 w-4" />
            {t("materials.actions.textMode")}
          </Button>
          <Button disabled={disabled || form.title.trim().length === 0} onClick={onDuplicate} type="button" variant="outline">
            <Copy className="h-4 w-4" />
            {t("materials.actions.duplicate")}
          </Button>
          {form.id ? (
            <Button disabled={disabled} onClick={() => onArchive(form.id!)} type="button" variant="outline">
              <Archive className="h-4 w-4" />
              {t("materials.actions.archive")}
            </Button>
          ) : null}
        </div>
      </div>
      {imageGenerationProgress ? (
        <MaterialImageProgress value={imageGenerationProgress} />
      ) : null}
      <div className="playsay-material-preview playsay-material-reader">
        <LessonMaterialDocumentView
          material={materialPreviewFromForm(form)}
          mode="teacherPreview"
          onAssetTagsChange={onUpdateAssetTags}
          onBlockPatchCommit={onBlockPatchCommit}
          onBlockPatch={onBlockPatch}
        />
      </div>
      {message ? (
        <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
          {message}
        </div>
      ) : null}
    </>
  );
}
