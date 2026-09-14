import { useState } from "react";
import type { LessonMaterialAsset } from "../../../shared/api/playsay";
import {
  materialPreviewFromForm,
  type MaterialEditorBlock,
  type MaterialFormState,
  type MaterialImageGenerationProgress,
} from "../model/materialDocument";
import { LessonMaterialDocumentView } from "./LessonMaterialDocumentView";
import { MaterialImageProgress } from "./MaterialImageProgress";

type MaterialReaderPresentationMode = "default" | "html-game-focus" | "image-focus" | "external-activity-focus";

export function MaterialReaderPreview({
  form,
  imageGenerationProgress,
  message,
  onBlockPatch,
  onBlockPatchCommit,
  onVideoMetadataEdit,
  onUpdateAssetTags,
}: {
  form: MaterialFormState;
  imageGenerationProgress: MaterialImageGenerationProgress | null;
  message: string | null;
  onBlockPatch: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
  onVideoMetadataEdit?: (blockId: string) => void;
  onBlockPatchCommit: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
  onUpdateAssetTags: (assetId: string, tags: string[]) => Promise<LessonMaterialAsset | null>;
}) {
  const [presentationMode, setPresentationMode] = useState<MaterialReaderPresentationMode>("default");

  return (
    <>
      {imageGenerationProgress ? (
        <MaterialImageProgress value={imageGenerationProgress} />
      ) : null}
      <div
        className="playsay-material-preview playsay-material-reader"
        data-presentation-mode={presentationMode}
      >
        <LessonMaterialDocumentView
          material={materialPreviewFromForm(form)}
          mode="teacherPreview"
          onAssetTagsChange={onUpdateAssetTags}
          onBlockPatchCommit={onBlockPatchCommit}
          onVideoMetadataEdit={onVideoMetadataEdit}
          onBlockPatch={onBlockPatch}
          onPresentationModeChange={setPresentationMode}
        />
      </div>
      {message ? (
        <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground" role="alert">
          {message}
        </div>
      ) : null}
    </>
  );
}
