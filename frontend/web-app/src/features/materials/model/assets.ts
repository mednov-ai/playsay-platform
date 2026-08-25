import type { LessonMaterial, LessonMaterialAsset, LessonMaterialJson } from "../../../shared/api/playsay";
import type { MaterialAssetLibraryItem, MaterialEditorBlock, MaterialEditorDocument } from "./types";
import { editorDocumentFromJson, materialMatchingPairTargetKind } from "./documentSerde";
import { asJsonObject, asString, uniqueMaterialTags } from "./formatters";

export function materialDocumentAssetIds(document: MaterialEditorDocument): string[] {
  const ids = new Set<string>();
  document.pages.forEach((page) => {
    page.blocks.forEach((block) => {
      (block.pairs ?? []).forEach((pair) => {
        const assetId = materialAssetIdFromUrl(pair.imageUrl);
        if (assetId) {
          ids.add(assetId);
        }
      });
      const blockAssetId = materialAssetIdFromUrl(block.url);
      if (blockAssetId) {
        ids.add(blockAssetId);
      }
      const worksheetAssetId = materialAssetIdFromUrl(block.sourceAsset);
      if (worksheetAssetId) {
        ids.add(worksheetAssetId);
      }
      const gameIconAssetId = materialAssetIdFromUrl(block.gameIconUrl);
      if (gameIconAssetId) {
        ids.add(gameIconAssetId);
      }
    });
  });
  return [...ids].sort();
}

export function materialAssetLibraryItemFromAsset(material: LessonMaterial, asset: LessonMaterialAsset): MaterialAssetLibraryItem | null {
  if (asset.kind !== "GENERATED_IMAGE") {
    return null;
  }

  const metadata = asJsonObject(asset.metadata);
  const tags = materialAssetTags(metadata);
  const prompt = asString(metadata.sourcePrompt) || asString(metadata.prompt);
  const alt = asString(metadata.sourceAlt) || asString(metadata.alt) || asString(metadata.title);
  const searchText = [
    material.title,
    asset.kind,
    prompt,
    alt,
    tags.join(" "),
  ].join(" ").toLowerCase();

  return {
    alt,
    asset,
    materialId: material.id,
    materialTitle: material.title,
    prompt,
    searchText,
    tags,
  };
}

export function matchingAssetSearchResults(
  assetLibrary: MaterialAssetLibraryItem[],
  query: string,
): MaterialAssetLibraryItem[] {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) {
    return [];
  }

  return assetLibrary.filter((item) => terms.every((term) => item.searchText.includes(term)));
}

export function materialAssetTagsMap(assets: LessonMaterialAsset[]): Record<string, string[]> {
  return assets.reduce<Record<string, string[]>>((result, asset) => {
    const tags = materialAssetTags(asset.metadata);
    if (tags.length > 0) {
      result[asset.id] = tags;
    }
    return result;
  }, {});
}

export function materialAssetTags(metadataValue: LessonMaterialJson | unknown): string[] {
  const metadata = asJsonObject(metadataValue);
  return Array.isArray(metadata.tags)
    ? uniqueMaterialTags(metadata.tags.map(asString))
    : [];
}

export function materialAssetIdFromUrl(value: string | undefined): string | null {
  const marker = "material-asset:";
  const clean = value?.trim() ?? "";
  if (!clean.startsWith(marker)) {
    return null;
  }
  return clean.slice(marker.length).trim() || null;
}

export function resolveMaterialImageUrl(value: string | undefined, assetUrls: Record<string, string>): string | undefined {
  const assetId = materialAssetIdFromUrl(value);
  if (assetId) {
    return assetUrls[assetId];
  }
  return value?.trim() || undefined;
}

export function materialDocumentBlocks(material: LessonMaterial): MaterialEditorBlock[] {
  return editorDocumentFromJson(material.document, material.title).pages.flatMap((page) => page.blocks);
}

export function countPendingMaterialImageTargets(
  document: MaterialEditorDocument,
  assets: LessonMaterialAsset[] = [],
): number {
  const assetsById = materialAssetsById(assets);
  return document.pages.reduce((total, page) => (
    total + page.blocks.reduce((pageTotal, block) => {
      if (
        block.type === "generatedImage" &&
        materialImagePromptNeedsGeneration(block.url, block.prompt, assetsById)
      ) {
        return pageTotal + 1;
      }

      if (block.type !== "matchingPairs") {
        return pageTotal;
      }

      return pageTotal + (block.pairs ?? []).filter((pair) => (
        materialMatchingPairTargetKind(pair) === "IMAGE" &&
        materialImagePromptNeedsGeneration(pair.imageUrl, pair.imagePrompt, assetsById)
      )).length;
    }, 0)
  ), 0);
}

export function materialAssetsById(assets: LessonMaterialAsset[]): Record<string, LessonMaterialAsset> {
  return assets.reduce<Record<string, LessonMaterialAsset>>((result, asset) => {
    result[asset.id] = asset;
    return result;
  }, {});
}

export function materialImagePromptNeedsGeneration(
  imageUrl: string | undefined,
  prompt: string | undefined,
  assetsById: Record<string, LessonMaterialAsset>,
): boolean {
  const cleanPrompt = normalizeMaterialImagePrompt(prompt);
  if (!cleanPrompt) {
    return false;
  }

  const cleanUrl = imageUrl?.trim() ?? "";
  if (!cleanUrl) {
    return true;
  }

  const assetId = materialAssetIdFromUrl(cleanUrl);
  if (!assetId) {
    return false;
  }

  const asset = assetsById[assetId];
  if (!asset) {
    return true;
  }
  if (asset.kind !== "GENERATED_IMAGE") {
    return false;
  }

  return normalizeMaterialImagePrompt(materialAssetSourcePrompt(asset)) !== cleanPrompt;
}

export function materialAssetSourcePrompt(asset: LessonMaterialAsset): string {
  const metadata = asJsonObject(asset.metadata);
  return asString(metadata.sourcePrompt) ||
    asString(metadata.prompt).split("\n\nCreate a new original illustration")[0];
}

export function normalizeMaterialImagePrompt(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}
