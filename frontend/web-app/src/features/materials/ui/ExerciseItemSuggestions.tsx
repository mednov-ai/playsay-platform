import { Check, X } from "lucide-react";
import type { MaterialExerciseItem } from "../model/materialDocument";
import { useAppTranslation } from "../../../shared/i18n";

export function ExerciseItemSuggestions({
  disabled,
  item,
  onAccept,
  onReject,
}: {
  disabled: boolean;
  item: MaterialExerciseItem;
  onAccept: (suggestionValue: string) => void;
  onReject: (suggestionValue: string) => void;
}) {
  const { t } = useAppTranslation();

  if (!item.aiSuggestedAnswers?.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {item.aiSuggestedAnswers.map((suggestion) => (
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-white px-2 py-0.5 text-xs font-bold text-foreground" key={suggestion.value}>
          <button
            aria-label={t("materials.blockEditor.acceptSuggestion", { value: suggestion.value })}
            className="inline-flex items-center gap-1 text-primary"
            disabled={disabled}
            onClick={() => onAccept(suggestion.value)}
            title={suggestion.reason || t("materials.blockEditor.acceptSuggestion", { value: suggestion.value })}
            type="button"
          >
            <Check className="h-3.5 w-3.5" />
            {suggestion.value}
          </button>
          <button
            aria-label={t("materials.blockEditor.rejectSuggestion", { value: suggestion.value })}
            className="text-muted-foreground"
            disabled={disabled}
            onClick={() => onReject(suggestion.value)}
            title={t("materials.blockEditor.rejectSuggestion", { value: suggestion.value })}
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
    </div>
  );
}
