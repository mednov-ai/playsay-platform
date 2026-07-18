import type { LessonMaterialAsset } from "../../../shared/api/playsay";
import {
  materialPreviewFromForm,
  type MaterialEditorBlock,
  type MaterialFormState,
  type MaterialImageGenerationProgress,
} from "../model/materialDocument";
import { LessonMaterialDocumentView } from "./LessonMaterialDocumentView";
import { MaterialImageProgress } from "./MaterialImageProgress";

export function MaterialReaderPreview({
  form,
  imageGenerationProgress,
  message,
  onBlockPatch,
  onBlockPatchCommit,
  onUpdateAssetTags,
}: {
  form: MaterialFormState;
  imageGenerationProgress: MaterialImageGenerationProgress | null;
  message: string | null;
  onBlockPatch: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
  onBlockPatchCommit: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
  onUpdateAssetTags: (assetId: string, tags: string[]) => Promise<LessonMaterialAsset | null>;
}) {
  return (
    <>
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
