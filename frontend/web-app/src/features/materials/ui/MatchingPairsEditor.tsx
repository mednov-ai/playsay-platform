import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  DEFAULT_MATCHING_PAIR_MAX_ERRORS,
  defaultMatchingImagePrompt,
  editableMatchingPairs,
  emptyMatchingPair,
  matchingEffectiveMaxErrors,
  matchingAssetSearchResults,
  materialMatchingPairTargetKind,
  type MaterialAssetLibraryItem,
  type MaterialEditorBlock,
  type MaterialMatchingPair,
} from "../model/materialDocument";
import { useAppTranslation } from "../../../shared/i18n";

export function MatchingPairsEditor({
  assetLibrary,
  block,
  currentMaterialId,
  disabled,
  onUpdate,
}: {
  assetLibrary: MaterialAssetLibraryItem[];
  block: MaterialEditorBlock;
  currentMaterialId: string | null;
  disabled: boolean;
  onUpdate: (patch: Partial<MaterialEditorBlock>) => void;
}) {
  const { t } = useAppTranslation();
  const draftRowsRef = useRef<MaterialMatchingPair[]>([
    emptyMatchingPair(),
    emptyMatchingPair(),
  ]);
  const [assetQueries, setAssetQueries] = useState<Record<string, string>>({});
  const pairs = editableMatchingPairs(block.pairs ?? [], draftRowsRef.current);
  const maxErrors = block.assessment?.maxErrors ?? DEFAULT_MATCHING_PAIR_MAX_ERRORS;
  const effectiveMaxErrors = matchingEffectiveMaxErrors(maxErrors, pairs.length);

  function updatePairs(nextPairs: MaterialMatchingPair[]) {
    onUpdate({ pairs: nextPairs });
  }

  function updateMaxErrors(value: number) {
    onUpdate({
      assessment: {
        ...block.assessment,
        maxErrors: value,
      },
    });
  }

  function updatePair(pairId: string, patch: Partial<MaterialMatchingPair>) {
    updatePairs(pairs.map((pair) => (pair.id === pairId ? { ...pair, ...patch } : pair)));
  }

  function toggleImage(pair: MaterialMatchingPair, checked: boolean) {
    if (checked) {
      const imageAlt = pair.right.trim() || pair.left.trim();
      updatePair(pair.id, {
        targetKind: "IMAGE",
        imageAlt: imageAlt || undefined,
        imagePrompt: pair.imagePrompt?.trim() || (imageAlt ? defaultMatchingImagePrompt(imageAlt) : ""),
      });
      return;
    }

    updatePair(pair.id, {
      targetKind: "TEXT",
      imagePrompt: undefined,
      imageAlt: undefined,
      imageUrl: undefined,
    });
  }

  function chooseAsset(pair: MaterialMatchingPair, item: MaterialAssetLibraryItem) {
    const nextRight = pair.right.trim() || item.alt || item.tags[0] || item.materialTitle;
    const imageUrl = currentMaterialId && currentMaterialId === item.materialId
      ? `material-asset:${item.asset.id}`
      : undefined;

    updatePair(pair.id, {
      right: nextRight,
      targetKind: "IMAGE",
      imageAlt: nextRight,
      imagePrompt: item.prompt || pair.imagePrompt || defaultMatchingImagePrompt(nextRight || pair.left),
      imageUrl,
    });
  }

  function addRow() {
    updatePairs([...pairs, emptyMatchingPair()]);
  }

  function removeRow(pairId: string) {
    updatePairs(editableMatchingPairs(pairs.filter((pair) => pair.id !== pairId), []));
  }

  return (
    <div className="playsay-matching-editor">
      <div className="playsay-matching-editor-controls">
        <label className="playsay-matching-error-limit" data-scope="block">
          <span>{t("materials.matching.maxErrors")}</span>
          <input
            aria-label={t("materials.matching.maxErrorsAria")}
            disabled={disabled}
            max={10}
            min={1}
            onChange={(event) => updateMaxErrors(Number(event.target.value))}
            type="number"
            value={maxErrors}
          />
          <small>{t("materials.matching.effectiveErrors", { count: effectiveMaxErrors })}</small>
        </label>
      </div>
      <div className="playsay-matching-editor-head" aria-hidden="true">
        <span>{t("materials.matching.left")}</span>
        <span>{t("materials.matching.right")}</span>
        <span />
      </div>
      {pairs.map((pair, index) => {
        const isImage = materialMatchingPairTargetKind(pair) === "IMAGE";
        const assetQuery = assetQueries[pair.id] ?? "";
        const assetResults = isImage ? matchingAssetSearchResults(assetLibrary, assetQuery).slice(0, 5) : [];
        return (
          <div className="playsay-matching-editor-row" key={pair.id}>
            <input
              aria-label={t("materials.matching.leftAria", { index: index + 1 })}
              className="playsay-input"
              disabled={disabled}
              maxLength={240}
              onChange={(event) => updatePair(pair.id, { left: event.target.value })}
              placeholder={t("materials.matching.leftPlaceholder")}
              value={pair.left}
            />
            <input
              aria-label={t("materials.matching.rightAria", { index: index + 1 })}
              className="playsay-input"
              disabled={disabled}
              maxLength={240}
              onChange={(event) => {
                const value = event.target.value;
                updatePair(pair.id, {
                  right: value,
                  imageAlt: isImage ? value : undefined,
                });
              }}
              placeholder={isImage ? t("materials.matching.imageRightPlaceholder") : t("materials.matching.textRightPlaceholder")}
              value={pair.right}
            />
            <div className="playsay-matching-row-tools">
              <label className="playsay-image-checkbox">
                <input
                  checked={isImage}
                  disabled={disabled}
                  onChange={(event) => toggleImage(pair, event.target.checked)}
                  type="checkbox"
                />
                <span>{t("materials.matching.imageTarget")}</span>
              </label>
              <Button
                aria-label={t("materials.matching.removeRow")}
                disabled={disabled || pairs.length <= 2}
                onClick={() => removeRow(pair.id)}
                type="button"
                variant="outline"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {isImage ? (
              <div className="playsay-matching-image-fields">
                <input
                  aria-label={t("materials.matching.assetSearchAria", { index: index + 1 })}
                  className="playsay-input"
                  disabled={disabled}
                  maxLength={80}
                  onChange={(event) => setAssetQueries((current) => ({ ...current, [pair.id]: event.target.value }))}
                  placeholder={t("materials.matching.assetSearchPlaceholder")}
                  value={assetQuery}
                />
                {assetQuery.trim() ? (
                  <div className="playsay-matching-asset-results">
                    {assetResults.length > 0 ? (
                      assetResults.map((item) => (
                        <button
                          className="playsay-matching-asset-chip"
                          disabled={disabled}
                          key={`${item.materialId}:${item.asset.id}`}
                          onClick={() => chooseAsset(pair, item)}
                          type="button"
                        >
                          <span>{item.alt || item.prompt || t("materials.blockTypes.generatedImage")}</span>
                          <small>
                            {currentMaterialId === item.materialId ? t("materials.matching.assetSource") : t("materials.matching.promptSource")} · {item.tags.slice(0, 3).join(", ") || item.materialTitle}
                          </small>
                        </button>
                      ))
                    ) : (
                      <span className="playsay-matching-asset-empty">{t("materials.matching.assetEmpty")}</span>
                    )}
                  </div>
                ) : null}
                <textarea
                  aria-label={t("materials.matching.imagePromptAria", { index: index + 1 })}
                  className="playsay-input min-h-20 resize-y py-3"
                  disabled={disabled}
                  maxLength={1_000}
                  onChange={(event) => updatePair(pair.id, {
                    imagePrompt: event.target.value,
                    imageUrl: undefined,
                  })}
                  placeholder={t("materials.matching.imagePromptPlaceholder")}
                  value={pair.imagePrompt ?? ""}
                />
              </div>
            ) : null}
          </div>
        );
      })}
      <Button disabled={disabled} onClick={addRow} type="button" variant="outline">
        <Plus className="h-4 w-4" />
        {t("materials.matching.addRow")}
      </Button>
    </div>
  );
}
