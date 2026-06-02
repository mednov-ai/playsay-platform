import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchMaterialAssets,
  type LessonMaterial,
  type LessonMaterialAsset,
} from "../../../shared/api/playsay";
import {
  type MaterialAssetLibraryItem,
  materialAssetLibraryItemFromAsset,
} from "../model/materialDocument";

export function useMaterialAssets({
  canManage,
  formMaterialId,
  materials,
}: {
  canManage: boolean;
  formMaterialId: string | null;
  materials: LessonMaterial[];
}) {
  const [assetLibrary, setAssetLibrary] = useState<MaterialAssetLibraryItem[]>([]);

  const currentMaterialAssets = useMemo(() => (
    formMaterialId
      ? assetLibrary.filter((item) => item.materialId === formMaterialId).map((item) => item.asset)
      : []
  ), [assetLibrary, formMaterialId]);

  const syncMaterialAssets = useCallback((material: LessonMaterial, assets: LessonMaterialAsset[]) => {
    const nextItems = assets
      .map((asset) => materialAssetLibraryItemFromAsset(material, asset))
      .filter((item): item is MaterialAssetLibraryItem => item !== null);
    setAssetLibrary((current) => [
      ...current.filter((item) => item.materialId !== material.id),
      ...nextItems,
    ]);
  }, []);

  useEffect(() => {
    if (!canManage || materials.length === 0) {
      setAssetLibrary([]);
      return;
    }

    let active = true;

    Promise.allSettled(
      materials.slice(0, 40).map(async (material) => {
        const assets = await fetchMaterialAssets(material.id);
        return assets
          .map((asset) => materialAssetLibraryItemFromAsset(material, asset))
          .filter((item): item is MaterialAssetLibraryItem => item !== null);
      }),
    ).then((results) => {
      if (!active) {
        return;
      }

      setAssetLibrary(results.flatMap((result) => (
        result.status === "fulfilled" ? result.value : []
      )));
    });

    return () => {
      active = false;
    };
  }, [canManage, materials]);

  return {
    assetLibrary,
    currentMaterialAssets,
    syncMaterialAssets,
  };
}
