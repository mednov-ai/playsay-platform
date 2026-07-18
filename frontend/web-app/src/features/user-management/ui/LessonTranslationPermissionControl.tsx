import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppTranslation } from "../../../shared/i18n";

export function LessonTranslationPermissionControl({
  allowed,
  disabled = false,
  onChange,
  onError,
  onSaved,
  studentName,
}: {
  allowed: boolean;
  disabled?: boolean;
  onChange: (allowed: boolean) => Promise<unknown>;
  onError?: () => void;
  onSaved?: () => void;
  studentName: string;
}) {
  const { t } = useAppTranslation();
  const [checked, setChecked] = useState(allowed);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setChecked(allowed);
  }, [allowed]);

  async function update(next: boolean) {
    const previous = checked;
    setChecked(next);
    setPending(true);
    try {
      await onChange(next);
      onSaved?.();
    } catch {
      setChecked(previous);
      onError?.();
    } finally {
      setPending(false);
    }
  }

  return (
    <label className="flex min-w-0 items-start gap-2 rounded-xl border border-border bg-muted/35 p-3 text-sm">
      <input
        aria-label={t("userManagement.translationPermission.aria", { name: studentName })}
        checked={checked}
        className="mt-0.5 h-4 w-4 accent-primary"
        disabled={disabled || pending}
        onChange={(event) => void update(event.target.checked)}
        type="checkbox"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-2 font-extrabold">
          {t("userManagement.translationPermission.label")}
          {pending ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin text-primary" /> : null}
        </span>
        <span className="mt-0.5 block text-xs font-semibold leading-5 text-muted-foreground">
          {t("userManagement.translationPermission.hint")}
        </span>
      </span>
    </label>
  );
}
