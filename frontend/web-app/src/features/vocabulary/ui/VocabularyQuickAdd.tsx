import { BookPlus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "../../../components/ui/button";
import type { CreateVocabularyEntry, VocabularyEntry } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { normalizedVariants, VocabularyEntryDialog } from "./VocabularyEntryDialog";

export function VocabularyQuickAdd({
  children,
  onSaved,
  recipientSubjects = [],
  source,
  triggerClassName = "mt-2",
  triggerLabelClassName,
}: {
  children?: ReactNode;
  onSaved?: (entries: VocabularyEntry[]) => void;
  recipientSubjects?: string[];
  source: Omit<CreateVocabularyEntry, "sourceText">;
  triggerClassName?: string;
  triggerLabelClassName?: string;
}) {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      {children}
      <Button
        aria-label={t("vocabulary.actions.add")}
        className={triggerClassName}
        onClick={() => setOpen(true)}
        title={t("vocabulary.actions.add")}
        type="button"
        variant="outline"
      >
        <BookPlus className="h-4 w-4" />
        <span className={triggerLabelClassName}>{t("vocabulary.actions.add")}</span>
      </Button>
      <VocabularyEntryDialog
        onClose={() => setOpen(false)}
        onSaved={onSaved}
        open={open}
        recipientSubjects={recipientSubjects}
        source={source}
      />
    </div>
  );
}

export { normalizedVariants };
