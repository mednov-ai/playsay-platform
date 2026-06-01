import { useEffect, useState, type ReactNode } from "react";
import { FileText } from "lucide-react";
import { fetchMaterialAssetObjectUrl, fetchMaterialAssets, type LessonMaterial, type LessonMaterialAsset } from "../../../shared/api/playsay";
import {
  MaterialAnswerBlock,
  MaterialAnswerState,
  MaterialEditorBlock,
  MaterialRenderMode,
  defaultMaterialPage,
  editorDocumentFromJson,
  formatMaterialScore,
  materialAssetTagsMap,
  materialDocumentAssetIds,
  materialMaxScore,
} from "../model/materialDocument";
import { RenderedMaterialBlock } from "./blocks/RenderedMaterialBlock";

export function LessonMaterialDocumentView({
  answers = {},
  material,
  mode = "classroom",
  onAnswerChange,
  onAssetTagsChange,
  onBlockPatchCommit,
  onBlockPatch,
  score,
}: {
  answers?: MaterialAnswerState;
  material: LessonMaterial;
  mode?: MaterialRenderMode;
  onAnswerChange?: (blockId: string, answer: MaterialAnswerBlock) => void;
  onAssetTagsChange?: (assetId: string, tags: string[]) => Promise<LessonMaterialAsset | null>;
  onBlockPatchCommit?: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
  onBlockPatch?: (blockId: string, patch: Partial<MaterialEditorBlock>) => void;
  score?: number | null;
}) {
  const document = editorDocumentFromJson(material.document);
  const page = document.pages[0] ?? defaultMaterialPage(material.title);
  const maxScore = materialMaxScore(material.scoringRubric);
  const assetIds = materialDocumentAssetIds(document);
  const assetKey = assetIds.join("|");
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [assetTags, setAssetTags] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let active = true;
    const objectUrls = new Set<string>();

    if (material.id === "preview" || assetKey.length === 0) {
      setAssetUrls({});
      setAssetTags({});
      return () => {
        active = false;
      };
    }

    fetchMaterialAssets(material.id)
      .then(async (assets) => {
        const entries = await Promise.all(assets.map(async (asset) => {
          const externalUrl = asset.externalUrl?.trim();
          if (externalUrl) {
            return [asset.id, externalUrl] as const;
          }

          if (!asset.contentUrl?.trim()) {
            return null;
          }

          const objectUrl = await fetchMaterialAssetObjectUrl(material.id, asset.id);
          if (!active) {
            URL.revokeObjectURL(objectUrl);
            return null;
          }
          objectUrls.add(objectUrl);
          return [asset.id, objectUrl] as const;
        }));

        if (active) {
          setAssetUrls(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null)));
          setAssetTags(materialAssetTagsMap(assets));
        }
      })
      .catch(() => {
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        objectUrls.clear();
        if (active) {
          setAssetUrls({});
          setAssetTags({});
        }
      });

    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
    };
  }, [assetKey, material.id, material.updatedAt]);

  return (
    <div className="playsay-rendered-material">
      <div className="playsay-material-score-badge">
        <span>{material.cefrLevel}</span>
        <strong>{formatMaterialScore(score ?? maxScore)}</strong>
      </div>
      <div className="playsay-task-kicker">
        <FileText className="h-4 w-4 text-primary" />
        {material.title}
      </div>
      <h3>{page.title}</h3>
      {material.description ? <p className="playsay-task-subtitle">{material.description}</p> : null}
      <div className="playsay-material-blocks">
        {page.blocks.map((block) => (
          <RenderedMaterialBlock
            answer={answers[block.id]}
            assetTags={assetTags}
            assetUrls={assetUrls}
            block={block}
            key={block.id}
            mode={mode}
            onAnswerChange={onAnswerChange}
            onAssetTagsChange={async (assetId, tags) => {
              setAssetTags((current) => ({ ...current, [assetId]: tags }));
              await onAssetTagsChange?.(assetId, tags);
            }}
            onBlockPatchCommit={onBlockPatchCommit}
            onBlockPatch={onBlockPatch}
          />
        ))}
      </div>
    </div>
  );
}

export function FallbackLessonDocument() {
  return (
    <>
      <div className="playsay-task-kicker">
        <FileText className="h-4 w-4 text-primary" />
        2. Let's chat
      </div>
      <h3>Make a guess and complete the descriptions below the pictures</h3>
      <p className="playsay-task-subtitle">The importance of food for travellers</p>

      <div className="playsay-task-cards">
        <TaskPictureCard caption="Travellers who think food is important" tone="mint" />
        <TaskPictureCard caption="Travellers who think food is not important" tone="yellow" />
      </div>

      <div className="playsay-fill-exercise">
        <label>
          I am in the
          <input aria-label="gap 1" defaultValue="" />
        </label>
        <label>
          I see a lot of
          <input aria-label="gap 2" defaultValue="" />
          around.
        </label>
        <label>
          I feel
          <input aria-label="gap 3" defaultValue="" />
          because the trip is exciting.
        </label>
      </div>
    </>
  );
}

export function AssignmentStub({
  active = false,
  tag,
  title,
}: {
  active?: boolean;
  tag: string;
  title: string;
}) {
  return (
    <article className="playsay-assignment-card" data-active={active ? "true" : "false"}>
      <div className="text-sm font-extrabold text-foreground">{title}</div>
      <div className="mt-2 inline-flex rounded-full border border-primary/15 bg-white px-2 py-1 text-xs font-extrabold text-primary">
        {tag}
      </div>
    </article>
  );
}

function TaskPictureCard({
  caption,
  tone,
}: {
  caption: string;
  tone: "mint" | "yellow";
}) {
  const toneClass = tone === "mint" ? "playsay-picture-card-mint" : "playsay-picture-card-yellow";

  return (
    <figure className={`playsay-picture-card ${toneClass}`}>
      <div className="playsay-picture-illustration">
        <div className="playsay-picture-face" />
        <div className="playsay-picture-plate" />
        <div className="playsay-picture-tower" />
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export function AnnotationToolButton({
  active,
  children,
  disabled = false,
  label,
  onClick,
  testId,
}: {
  active: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      aria-label={label}
      className="playsay-annotation-button"
      data-active={active ? "true" : "false"}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
