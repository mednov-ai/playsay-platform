import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { startLessonAssertionLogin } from "../../../shared/auth/oidc";
import { useAppTranslation } from "../../../shared/i18n";

export function LessonAssertionPage({ lessonId }: { lessonId: string }) {
  const { t } = useAppTranslation();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const assertion = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("assertion");
    window.history.replaceState({}, document.title, window.location.pathname);
    if (!assertion) {
      setFailed(true);
      return;
    }
    void startLessonAssertionLogin(assertion, `/lessons/${encodeURIComponent(lessonId)}/classroom`).catch(() => setFailed(true));
  }, [lessonId]);

  return (
    <main className="grid min-h-screen place-items-center bg-background p-5 text-foreground">
      <div aria-live="polite" className="flex items-center gap-3 rounded-2xl border border-border bg-background p-5 font-bold shadow-sm">
        {!failed ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : null}
        {failed ? t("registration.lessonAccess.error") : t("registration.lessonAccess.signingIn")}
      </div>
    </main>
  );
}
