import { Plus, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import type { MaterialWordBankOption } from "../model/materialDocument";
import { useAppTranslation } from "../../../shared/i18n";

export function WordBankOptionsEditor({
  disabled,
  onAdd,
  onRemove,
  onUpdate,
  options,
}: {
  disabled: boolean;
  onAdd: () => void;
  onRemove: (optionId: string) => void;
  onUpdate: (optionId: string, patch: Partial<MaterialWordBankOption>) => void;
  options: MaterialWordBankOption[];
}) {
  const { t } = useAppTranslation();

  return (
    <div className="grid gap-1.5 rounded-lg border border-border bg-white p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-extrabold uppercase text-muted-foreground">
          {t("materials.blockEditor.wordBank")}
        </span>
        <Button className="h-7 px-2 text-xs" disabled={disabled} onClick={onAdd} type="button" variant="outline">
          <Plus className="h-3.5 w-3.5" />
          {t("materials.blockEditor.addWordBankOption")}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/20 px-2 py-1" key={option.id}>
            <input
              aria-label={t("materials.blockEditor.wordBankOption")}
              className="w-24 border-0 bg-transparent text-sm font-bold outline-none"
              disabled={disabled}
              onChange={(event) => onUpdate(option.id, { value: event.target.value })}
              value={option.value}
            />
            <button
              aria-label={t("materials.blockEditor.removeWordBankOption", { value: option.value || t("materials.blockEditor.emptyWordBankOption") })}
              className="text-muted-foreground"
              disabled={disabled}
              onClick={() => onRemove(option.id)}
              title={t("materials.blockEditor.removeWordBankOption", { value: option.value || t("materials.blockEditor.emptyWordBankOption") })}
              type="button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
