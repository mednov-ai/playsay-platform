import { KeyRound, X } from "lucide-react";
import { useState } from "react";
import { Button } from "../../../components/ui/button";
import { startPasskeyRegistration } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

const promptStorageKey = "playsay.passkeyPrompt.v1";

export function PasskeyPrompt({ subject }: { subject: string }) {
  const { t } = useAppTranslation();
  const [visible, setVisible] = useState(() => !hasDismissedPrompt(subject));

  if (!visible) {
    return null;
  }

  function dismiss() {
    rememberDismissedPrompt(subject);
    setVisible(false);
  }

  function configure() {
    dismiss();
    void startPasskeyRegistration("/profile");
  }

  return (
    <aside
      aria-label={t("profile.passkeys.promptAria")}
      className="flex flex-col gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary" aria-hidden="true">
          <KeyRound className="h-5 w-5" />
        </span>
        <div>
          <strong className="text-sm font-extrabold">{t("profile.passkeys.promptTitle")}</strong>
          <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
            {t("profile.passkeys.promptDescription")}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button className="h-9 px-3 text-xs" onClick={configure} type="button">
          {t("profile.passkeys.add")}
        </Button>
        <Button
          aria-label={t("profile.passkeys.later")}
          className="h-9 w-9 p-0"
          onClick={dismiss}
          type="button"
          variant="outline"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  );
}

function hasDismissedPrompt(subject: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const dismissed = JSON.parse(window.localStorage.getItem(promptStorageKey) ?? "[]") as unknown;
    return Array.isArray(dismissed) && dismissed.includes(subject);
  } catch {
    return false;
  }
}

function rememberDismissedPrompt(subject: string): void {
  if (typeof window === "undefined") {
    return;
  }

  let dismissed: string[] = [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(promptStorageKey) ?? "[]") as unknown;
    if (Array.isArray(stored)) {
      dismissed = stored.filter((value): value is string => typeof value === "string");
    }
  } catch {
    dismissed = [];
  }
  window.localStorage.setItem(promptStorageKey, JSON.stringify([...new Set([...dismissed, subject])]));
}
