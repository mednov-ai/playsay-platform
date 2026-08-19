import { useEffect, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";

export function LessonLinksManualCopyDialog({ onClose, text }: { onClose: () => void; text: string }) {
  const { t } = useAppTranslation();
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const textarea = textareaRef.current;
    textarea?.focus({ preventScroll: true });
    textarea?.select();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [text]);

  async function copyAgain() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      textareaRef.current?.focus({ preventScroll: true });
      textareaRef.current?.select();
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-foreground/35 p-4" role="presentation">
      <div
        aria-labelledby="lesson-links-manual-copy-title"
        aria-modal="true"
        className="grid w-full max-w-xl gap-4 rounded-[1.5rem] border border-border bg-background p-5 text-foreground shadow-xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <h2 className="text-xl font-extrabold" id="lesson-links-manual-copy-title">{t("schedule.manualCopy.title")}</h2>
            <p className="text-sm font-semibold text-muted-foreground">{t("schedule.manualCopy.subtitle")}</p>
          </div>
          <Button aria-label={t("schedule.manualCopy.close")} onClick={onClose} type="button" variant="outline">
            <X className="h-4 w-4" />
          </Button>
        </header>
        <textarea
          aria-label={t("schedule.manualCopy.textLabel")}
          className="min-h-36 w-full resize-y rounded-xl border border-border bg-muted/40 p-3 font-mono text-sm"
          onFocus={(event) => event.currentTarget.select()}
          readOnly
          ref={textareaRef}
          value={text}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose} type="button" variant="outline">{t("common.actions.close")}</Button>
          <Button onClick={() => void copyAgain()} type="button">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {t(copied ? "schedule.manualCopy.copied" : "schedule.manualCopy.copyAgain")}
          </Button>
        </div>
      </div>
    </div>
  );
}
