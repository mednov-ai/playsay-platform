import type { LessonMaterialAsset } from "../../../shared/api/playsay";
import type { MaterialEditorBlock } from "./types";

/** A replacement must replace both halves of the pin, including an already canonical occurrence. */
export function uploadedHtmlGameReference(asset: LessonMaterialAsset): Partial<MaterialEditorBlock> {
  const gameId = typeof asset.metadata.gameId === "string" ? asset.metadata.gameId : undefined;
  const revisionId = typeof asset.metadata.gameRevisionId === "string" ? asset.metadata.gameRevisionId : undefined;
  return {
    gameId: gameId && revisionId ? gameId : undefined,
    gameRevisionId: gameId && revisionId ? revisionId : undefined,
    url: gameId && revisionId ? undefined : `material-asset:${asset.id}`,
    gameIconUrl: undefined,
    gameAdaptationJobId: undefined,
    gameAdaptationSourceAssetId: undefined,
  };
}
