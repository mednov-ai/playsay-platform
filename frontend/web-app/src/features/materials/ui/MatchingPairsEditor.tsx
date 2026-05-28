import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  defaultMatchingImagePrompt,
  editableMatchingPairs,
  emptyMatchingPair,
  matchingAssetSearchResults,
  materialMatchingPairTargetKind,
  type MaterialAssetLibraryItem,
  type MaterialEditorBlock,
  type MaterialMatchingPair,
} from "../model/materialDocument";

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
  const draftRowsRef = useRef<MaterialMatchingPair[]>([
    emptyMatchingPair(),
    emptyMatchingPair(),
  ]);
  const [assetQueries, setAssetQueries] = useState<Record<string, string>>({});
  const pairs = editableMatchingPairs(block.pairs ?? [], draftRowsRef.current);

  function updatePairs(nextPairs: MaterialMatchingPair[]) {
    onUpdate({ pairs: nextPairs });
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
      <div className="playsay-matching-editor-head" aria-hidden="true">
        <span>Слева</span>
        <span>Справа</span>
        <span />
      </div>
      {pairs.map((pair, index) => {
        const isImage = materialMatchingPairTargetKind(pair) === "IMAGE";
        const assetQuery = assetQueries[pair.id] ?? "";
        const assetResults = isImage ? matchingAssetSearchResults(assetLibrary, assetQuery).slice(0, 5) : [];
        return (
          <div className="playsay-matching-editor-row" key={pair.id}>
            <input
              aria-label={`Слева ${index + 1}`}
              className="playsay-input"
              disabled={disabled}
              maxLength={240}
              onChange={(event) => updatePair(pair.id, { left: event.target.value })}
              placeholder="слово / фраза"
              value={pair.left}
            />
            <input
              aria-label={`Справа ${index + 1}`}
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
              placeholder={isImage ? "что на картинке" : "ответ / перевод"}
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
                <span>image</span>
              </label>
              <Button
                aria-label="Удалить строку"
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
                  aria-label={`Поиск картинки по тегу ${index + 1}`}
                  className="playsay-input"
                  disabled={disabled}
                  maxLength={80}
                  onChange={(event) => setAssetQueries((current) => ({ ...current, [pair.id]: event.target.value }))}
                  placeholder="поиск существующей картинки по тегу"
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
                          <span>{item.alt || item.prompt || "AI image"}</span>
                          <small>
                            {currentMaterialId === item.materialId ? "asset" : "prompt"} · {item.tags.slice(0, 3).join(", ") || item.materialTitle}
                          </small>
                        </button>
                      ))
                    ) : (
                      <span className="playsay-matching-asset-empty">Нет картинок с таким тегом</span>
                    )}
                  </div>
                ) : null}
                <textarea
                  aria-label={`Prompt картинки ${index + 1}`}
                  className="playsay-input min-h-20 resize-y py-3"
                  disabled={disabled}
                  maxLength={1_000}
                  onChange={(event) => updatePair(pair.id, {
                    imagePrompt: event.target.value,
                    imageUrl: undefined,
                  })}
                  placeholder="prompt для AI-картинки без текста внутри"
                  value={pair.imagePrompt ?? ""}
                />
              </div>
            ) : null}
          </div>
        );
      })}
      <Button disabled={disabled} onClick={addRow} type="button" variant="outline">
        <Plus className="h-4 w-4" />
        Добавить строку
      </Button>
    </div>
  );
}
