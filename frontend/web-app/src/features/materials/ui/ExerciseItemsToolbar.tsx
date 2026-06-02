import { Plus, Sparkles } from "lucide-react";
import { Button } from "../../../components/ui/button";
import type { MaterialEditorBlock } from "../model/materialDocument";
import { useAppTranslation } from "../../../shared/i18n";

export function ExerciseItemsToolbar({
  blockType,
  canSuggest,
  canSuggestAcceptedAnswers,
  disabled,
  onAddItem,
  onSuggestBlockAnswers,
}: {
  blockType: MaterialEditorBlock["type"];
  canSuggest: boolean;
  canSuggestAcceptedAnswers: boolean;
  disabled: boolean;
  onAddItem: () => void;
  onSuggestBlockAnswers: () => void;
}) {
  const { t } = useAppTranslation();

  return (
    <div className="flex flex-wrap items-center justify-between gap-1.5">
      <div className="text-xs font-black uppercase text-muted-foreground">
        {t("materials.blockEditor.exerciseItems")}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button
          className="h-8 px-2 text-xs"
          disabled={disabled || !canSuggest}
          onClick={onSuggestBlockAnswers}
          title={!canSuggestAcceptedAnswers ? t("materials.blockEditor.suggestAnswersSaveRequired") : undefined}
          type="button"
          variant="outline"
        >
          <Sparkles className="h-4 w-4" />
          {t("materials.blockEditor.suggestAnswers")}
        </Button>
        <Button className="h-8 px-2 text-xs" disabled={disabled} onClick={onAddItem} type="button" variant="outline">
          <Plus className="h-4 w-4" />
          {blockType === "fillGaps" ? t("materials.blockEditor.addGapItem") : t("materials.blockEditor.addItem")}
        </Button>
      </div>
    </div>
  );
}
