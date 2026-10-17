import { expect, it } from "vitest";
import { uploadedHtmlGameReference } from "./uploadedHtmlGameReference";
import { cleanMaterialBlock } from "./documentSerde";
import type { LessonMaterialAsset } from "../../../shared/api/playsay";
import type { MaterialEditorBlock } from "./types";

it("replaces a canonical game occurrence with the newly uploaded pin and discards old game-specific metadata", () => {
  const previous: MaterialEditorBlock = { id: "same-occurrence", type: "htmlGame", title: "Old", gameId: "old-game", gameRevisionId: "old-revision", gameIconUrl: "old-cover", gameAdaptationJobId: "old-job", gameAdaptationSourceAssetId: "old-source" };
  const asset: LessonMaterialAsset = { id: "asset", materialId: "material", kind: "HTML_GAME", provider: "UPLOADED", createdAt: "", metadata: { gameId: "new-game", gameRevisionId: "new-revision" } };
  const saved = cleanMaterialBlock({ ...previous, ...uploadedHtmlGameReference(asset) });
  expect(saved).toMatchObject({ id: previous.id, gameId: "new-game", gameRevisionId: "new-revision" });
  expect(saved.url).toBeUndefined(); expect(saved.gameIconUrl).toBeUndefined(); expect(saved.gameAdaptationJobId).toBeUndefined(); expect(saved.gameAdaptationSourceAssetId).toBeUndefined();
});
