import { KeyRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/button";
import { startPasskeyRegistration } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

const promptStorageKey = "playsay.passkeyPrompt.v1";

export function PasskeyPrompt({ passkeyCount, subject }: { passkeyCount: number; subject: string }) {
  const { t } = useAppTranslation();
  const [visible, setVisible] = useState(() => passkeyCount === 0 && !hasDismissedPrompt(subject));

  useEffect(() => {
    if (!visible) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [visible]);

  if (!visible || passkeyCount > 0) {
    return null;
  }

  function dismiss() {
    rememberDismissedPrompt(subject);
    setVisible(false);
  }

  function configure() {
    dismiss();
    void startPasskeyRegistration({
      mode: "ensure",
      passkeyCountBefore: passkeyCount,
      returnPath: "/profile",
    });
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/55 p-4 backdrop-blur-sm">
      <aside
        aria-label={t("profile.passkeys.promptAria")}
        aria-modal="true"
        className="w-full max-w-md rounded-[1.5rem] border border-border bg-background p-5 shadow-2xl"
        role="dialog"
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary" aria-hidden="true">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-extrabold">{t("profile.passkeys.promptTitle")}</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
              {t("profile.passkeys.promptDescription")}
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button onClick={configure} type="button">
            <KeyRound className="h-4 w-4" />
            {t("profile.passkeys.configure")}
          </Button>
          <Button onClick={dismiss} type="button" variant="outline">
            <X className="h-4 w-4" />
            {t("profile.passkeys.later")}
          </Button>
        </div>
      </aside>
    </div>
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
