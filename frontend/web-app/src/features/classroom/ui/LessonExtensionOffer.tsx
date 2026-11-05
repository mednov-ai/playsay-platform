import { useState } from "react";
import type { LessonRoomSession } from "../model/session";
import { serverClockSynchronized } from "../../../shared/lib/serverClock";
import { useAppTranslation } from "../../../shared/i18n";

export function LessonExtensionOffer({ session, nowMs, onExtend, canManageSchedule = false }: {
  session: LessonRoomSession; nowMs: number; onExtend: (lessonId: string, revision: number) => Promise<void>; canManageSchedule?: boolean;
}) {
  const { t, i18n } = useAppTranslation();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deadline = session.accessEndsAt ? Date.parse(session.accessEndsAt) : Number.NaN;
  const revision = session.accessRevision;
  const validRevision = typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0;
  const offerKey = `${session.lessonId}:${revision ?? "unknown"}`;
  if (!serverClockSynchronized()) return <aside className="lesson-extension-offer" role="status">{t("lessonExtension.syncFailed")}</aside>;
  if (canManageSchedule && (session.canExtend == null || (session.canExtend &&
      (!Number.isFinite(nowMs) || !Number.isFinite(deadline) || !validRevision)))) {
    return <aside className="lesson-extension-offer" role="status">{t("lessonExtension.policyUnavailable")}</aside>;
  }
  if (!session.canExtend || typeof revision !== "number" || !validRevision || !Number.isFinite(nowMs) ||
      !Number.isFinite(deadline) || nowMs < deadline - 120_000 || nowMs >= deadline || dismissed === offerKey) return null;
  const extend = async () => {
    setPending(true); setError(null);
    try { await onExtend(session.lessonId, revision); }
    catch { setError(offerKey); }
    finally { setPending(false); }
  };
  return <aside className="lesson-extension-offer" aria-live="polite" aria-label={t("lessonExtension.title")}>
    <span>{t("lessonExtension.ending", { time: new Date(deadline).toLocaleTimeString(i18n?.resolvedLanguage, { hour: "2-digit", minute: "2-digit" }) })}</span>
    <button type="button" disabled={pending || !navigator.onLine} onClick={() => void extend()}>{t(pending ? "lessonExtension.pending" : "lessonExtension.extend")}</button>
    <button type="button" disabled={pending} onClick={() => setDismissed(offerKey)}>{t("lessonExtension.decline")}</button>
    {error === offerKey ? <span role="alert">{t("lessonExtension.failed")}</span> : null}
  </aside>;
}
