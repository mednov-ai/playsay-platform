import { useState, type PointerEvent } from "react";
import { Sparkles } from "lucide-react";
import { clampNumber, type MaterialEditorBlock } from "../../model/materialDocument";
import { useAppTranslation } from "../../../../shared/i18n";

export function MaterialImageInlineTools({
  assetId,
  block,
  onAssetTagsChange,
  onResizeCommit,
  onResize,
  tags,
}: {
  assetId: string | null;
  block: MaterialEditorBlock;
  onAssetTagsChange?: (assetId: string, tags: string[]) => void | Promise<void>;
  onResizeCommit?: (height: number) => void;
  onResize?: (height: number) => void;
  tags: string[];
}) {
  const { t } = useAppTranslation();

  function startResize(event: PointerEvent<HTMLButtonElement>) {
    if (!onResize) {
      return;
    }

    event.preventDefault();
    const resize = onResize;
    const startY = event.clientY;
    const startHeight = block.height ?? event.currentTarget.closest("figure")?.querySelector("img")?.getBoundingClientRect().height ?? 320;
    let latestHeight = Math.round(startHeight);

    function handlePointerMove(moveEvent: globalThis.PointerEvent) {
      latestHeight = Math.round(clampNumber(startHeight + moveEvent.clientY - startY, 120, 720));
      resize(latestHeight);
    }

    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      resize(latestHeight);
      onResizeCommit?.(latestHeight);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  return (
    <div className="playsay-image-tools">
      <MaterialImagePromptPopover block={block} />
      {assetId ? (
        <MaterialAssetTags
          assetId={assetId}
          onChange={onAssetTagsChange}
          tags={tags}
        />
      ) : null}
      {onResize ? (
        <button
          aria-label={t("materials.renderer.resizeImage")}
          className="playsay-image-resize-handle"
          onPointerDown={startResize}
          title={t("materials.renderer.resizeImage")}
          type="button"
        />
      ) : null}
    </div>
  );
}

export function MaterialImagePromptPopover({ block }: { block: MaterialEditorBlock }) {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(false);
  const prompt = block.prompt?.trim() || block.caption?.trim() || block.title || t("materials.renderer.imagePromptFallback");

  return (
    <span className="playsay-image-prompt">
      <button
        aria-expanded={open}
        aria-label={t("materials.renderer.showImagePrompt")}
        className="playsay-image-prompt-button"
        onClick={() => setOpen((current) => !current)}
        title={t("materials.renderer.imagePromptTitle")}
        type="button"
      >
        <Sparkles className="h-4 w-4" />
      </button>
      {open ? (
        <span className="playsay-image-prompt-popover" role="dialog">
          <strong>{t("materials.renderer.imagePromptHeading")}</strong>
          <span>{prompt}</span>
        </span>
      ) : null}
    </span>
  );
}

function MaterialAssetTags({
  assetId,
  onChange,
  tags,
}: {
  assetId: string;
  onChange?: (assetId: string, tags: string[]) => void | Promise<void>;
  tags: string[];
}) {
  const { t } = useAppTranslation();
  const [draftTag, setDraftTag] = useState("");

  function commitTag(value: string) {
    const normalized = normalizeMaterialTag(value);
    if (!normalized || !onChange) {
      setDraftTag("");
      return;
    }
    void onChange(assetId, uniqueMaterialTags([...tags, normalized]));
    setDraftTag("");
  }

  function removeTag(tag: string) {
    if (!onChange) {
      return;
    }
    void onChange(assetId, tags.filter((current) => current !== tag));
  }

  return (
    <span className="playsay-image-tags" aria-label={t("materials.renderer.imageTags")}>
      {tags.slice(0, 8).map((tag) => (
        <button
          className="playsay-image-tag"
          key={tag}
          onClick={() => removeTag(tag)}
          title={t("materials.renderer.removeTag")}
          type="button"
        >
          {tag}
        </button>
      ))}
      <input
        className="playsay-image-tag-input"
        disabled={!onChange}
        maxLength={40}
        onChange={(event) => setDraftTag(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitTag(draftTag);
          }
        }}
        placeholder={t("materials.renderer.tagPlaceholder")}
        value={draftTag}
      />
    </span>
  );
}

function uniqueMaterialTags(tags: string[]): string[] {
  const result: string[] = [];
  tags.forEach((tag) => {
    const normalized = normalizeMaterialTag(tag);
    if (normalized && !result.includes(normalized)) {
      result.push(normalized);
    }
  });
  return result.slice(0, 16);
}

function normalizeMaterialTag(value: string): string {
  const clean = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return clean.length >= 2 && clean.length <= 40 ? clean : "";
}
