import { Plus, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";
import {
  materialBlockLabel,
  type MaterialBlockType,
} from "../model/materialDocument";
import { materialBlockIcon } from "./materialBlockIcon";

const paletteGroups: Array<{
  key: "content" | "exercises" | "openTasks" | "advanced";
  types: MaterialBlockType[];
}> = [
  { key: "content", types: ["text", "image", "videoEmbed"] },
  { key: "exercises", types: ["flashcards", "fillGaps", "multipleChoice", "matchingPairs"] },
  { key: "openTasks", types: ["freeWriting", "speakingPrompt", "drawingArea"] },
  { key: "advanced", types: ["generatedImage", "htmlGame", "externalActivity"] },
];

export function MaterialBlockPalette({
  disabled,
  mobileOpen,
  onAddBlock,
  onClose,
}: {
  disabled: boolean;
  mobileOpen: boolean;
  onAddBlock: (type: MaterialBlockType) => void;
  onClose: () => void;
}) {
  const { t } = useAppTranslation();

  return (
    <aside
      aria-label={t("materials.editor.paletteTitle")}
      className="playsay-material-palette"
      data-mobile-open={mobileOpen ? "true" : "false"}
      id="material-block-palette"
    >
      <div className="playsay-material-palette-head">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-extrabold">
            <Plus className="h-4 w-4 text-primary" />
            {t("materials.editor.paletteTitle")}
          </div>
          <p>{t("materials.editor.paletteHint")}</p>
        </div>
        <Button
          aria-label={t("materials.editor.closePalette")}
          className="playsay-material-palette-close h-9 w-9 px-0"
          onClick={onClose}
          title={t("materials.editor.closePalette")}
          type="button"
          variant="outline"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="playsay-material-palette-groups">
        {paletteGroups.map((group, groupIndex) => (
          <section className="playsay-material-palette-group" key={group.key}>
            <h3>{t(`materials.editor.paletteGroups.${group.key}`)}</h3>
            <div className="playsay-material-palette-items">
              {group.types.map((type, typeIndex) => (
                <button
                  className="playsay-material-palette-item"
                  data-material-palette-first={groupIndex === 0 && typeIndex === 0 ? "true" : undefined}
                  disabled={disabled}
                  key={type}
                  onClick={() => onAddBlock(type)}
                  type="button"
                >
                  <span className="playsay-material-palette-icon">{materialBlockIcon(type)}</span>
                  <span>{materialBlockLabel(type)}</span>
                  <Plus className="h-3.5 w-3.5 text-primary" />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
