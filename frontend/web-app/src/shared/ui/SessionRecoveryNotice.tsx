import { useAppTranslation } from "../i18n";
import type { RecoveryPhase } from "../api/sessionRecovery";
import { Button } from "../../components/ui/button";

export function SessionRecoveryNotice({ phase, activeClassroom, onRetry, onSignIn }: {
  phase: RecoveryPhase;
  activeClassroom: boolean;
  onRetry: () => void;
  onSignIn: () => void;
}) {
  const { t } = useAppTranslation();
  if (phase === "ready") return null;
  const checking = phase === "recovering";
  const needsSignIn = phase === "signInRequired" || phase === "protocolError";
  return (
    <aside className="fixed left-4 right-4 top-4 z-[90] mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-2xl border border-border bg-background p-4 text-foreground shadow-xl"
      aria-label={t("sessionRecovery.title")} data-testid="session-recovery-notice">
      <p className="min-w-0 flex-1 text-sm" role="status" aria-live="polite" aria-busy={checking}>
        {t(`sessionRecovery.${phase}`)}
        {needsSignIn && activeClassroom ? <span className="mt-1 block">{t("sessionRecovery.lessonInterruption")}</span> : null}
      </p>
      {!checking ? (
        <Button type="button" onClick={needsSignIn ? onSignIn : onRetry}>
          {t(needsSignIn ? "sessionRecovery.signIn" : "sessionRecovery.retry")}
        </Button>
      ) : null}
    </aside>
  );
}
