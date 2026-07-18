import { useState, type ReactNode } from "react";
import {
  Archive,
  ArrowLeft,
  Check,
  Copy,
  Eye,
  MoreHorizontal,
  Play,
  Save,
  Settings2,
  Sparkles,
  Undo2,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";

export function MaterialEditorHeader({
  canGenerateImages,
  canSave,
  disabled,
  dirty,
  hasMaterial,
  mode,
  onArchive,
  onBack,
  onDuplicate,
  onGenerateImages,
  onOpenDetails,
  onPlay,
  onSave,
  onToggleMode,
  onUpdateTitle,
  pendingImageTargetsCount,
  title,
  workspaceNavigation,
}: {
  canGenerateImages: boolean;
  canSave: boolean;
  disabled: boolean;
  dirty: boolean;
  hasMaterial: boolean;
  mode: "edit" | "preview";
  onArchive: () => void;
  onBack: () => void;
  onDuplicate: () => void;
  onGenerateImages: () => void;
  onOpenDetails: () => void;
  onPlay: () => void;
  onSave: () => void;
  onToggleMode: () => void;
  onUpdateTitle: (value: string) => void;
  pendingImageTargetsCount: number;
  title: string;
  workspaceNavigation?: ReactNode;
}) {
  const { t } = useAppTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="playsay-material-editor-header">
      <Button
        aria-label={t("materials.editor.backToLibrary")}
        className="playsay-material-editor-back h-10 w-10 px-0"
        onClick={onBack}
        title={t("materials.editor.backToLibrary")}
        type="button"
        variant="outline"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <div className="playsay-material-editor-title-wrap">
        <input
          aria-label={t("materials.form.title")}
          className="playsay-material-editor-title"
          disabled={disabled || mode === "preview"}
          maxLength={160}
          onChange={(event) => onUpdateTitle(event.target.value)}
          placeholder={t("materials.editor.titlePlaceholder")}
          value={title}
        />
        <span className="playsay-material-save-state" data-dirty={dirty ? "true" : "false"}>
          {dirty ? <Undo2 className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          {dirty
            ? t("materials.editor.unsaved")
            : hasMaterial
              ? t("materials.editor.saved")
              : t("materials.editor.newDraft")}
        </span>
      </div>

      <div className="playsay-material-editor-header-actions">
        {workspaceNavigation}
        {mode === "edit" ? (
          <Button
            aria-label={t("materials.editor.details")}
            disabled={disabled}
            onClick={onOpenDetails}
            title={t("materials.editor.details")}
            type="button"
            variant="outline"
          >
            <Settings2 className="h-4 w-4" />
            <span className="playsay-material-action-label">{t("materials.editor.details")}</span>
          </Button>
        ) : null}
        <Button
          aria-label={mode === "edit" ? t("materials.editor.preview") : t("materials.editor.edit")}
          disabled={disabled || !canSave}
          onClick={onToggleMode}
          title={mode === "edit" ? t("materials.editor.preview") : t("materials.editor.edit")}
          type="button"
          variant="outline"
        >
          {mode === "edit" ? <Eye className="h-4 w-4" /> : <Undo2 className="h-4 w-4" />}
          <span className="playsay-material-action-label">
            {mode === "edit" ? t("materials.editor.preview") : t("materials.editor.edit")}
          </span>
        </Button>
        <Button
          aria-label={t("materials.actions.save")}
          disabled={disabled || !canSave || !dirty}
          onClick={onSave}
          title={t("materials.actions.save")}
          type="button"
        >
          <Save className="h-4 w-4" />
          <span className="playsay-material-action-label">{t("materials.actions.save")}</span>
        </Button>

        <div className="playsay-material-more">
          <Button
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={t("materials.editor.moreActions")}
            className="h-10 w-10 px-0"
            onClick={() => setMenuOpen((current) => !current)}
            title={t("materials.editor.moreActions")}
            type="button"
            variant="outline"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          {menuOpen ? (
            <div className="playsay-material-more-menu" role="menu">
              <button disabled={!canSave} onClick={() => { setMenuOpen(false); onPlay(); }} role="menuitem" type="button">
                <Play className="h-4 w-4" />
                {t("materials.actions.play")}
              </button>
              <button disabled={!canSave} onClick={() => { setMenuOpen(false); onDuplicate(); }} role="menuitem" type="button">
                <Copy className="h-4 w-4" />
                {t("materials.actions.duplicate")}
              </button>
              <button disabled={!canGenerateImages} onClick={() => { setMenuOpen(false); onGenerateImages(); }} role="menuitem" type="button">
                <Sparkles className="h-4 w-4" />
                {pendingImageTargetsCount > 0
                  ? t("materials.actions.generateWithCount", { count: pendingImageTargetsCount })
                  : t("materials.actions.generate")}
              </button>
              {hasMaterial ? (
                <button onClick={() => { setMenuOpen(false); onArchive(); }} role="menuitem" type="button">
                  <Archive className="h-4 w-4" />
                  {t("materials.actions.archive")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
