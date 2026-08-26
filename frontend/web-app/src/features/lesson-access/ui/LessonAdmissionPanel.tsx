import { useEffect, useState } from "react";
import { Ban, Check, Copy, Loader2, RefreshCw, RotateCw, UserCheck, UserX } from "lucide-react";
import { Button } from "../../../components/ui/button";
import type { ScheduledLesson } from "../../../shared/api/playsay";
import {
  approveLessonLobby,
  changeLessonAdmission,
  denyLessonLobby,
  fetchLessonAdmissions,
  revokeLessonAccessLink,
  rotateLessonAccessLink,
  type LessonAdmissionOverview,
} from "../../../shared/api/lessonAccess";
import { fetchLessonAccessLink } from "../../../shared/api/schedule";
import { useAppTranslation } from "../../../shared/i18n";
import { copyTextFromPromise } from "../../../shared/lib/clipboard";

export function LessonAdmissionPanel({ lesson }: { lesson: ScheduledLesson }) {
  const { t } = useAppTranslation();
  const [overview, setOverview] = useState<LessonAdmissionOverview | null>(null);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh(silent = false) {
    if (!silent) setBusy(true);
    try {
      setOverview(await fetchLessonAdmissions(lesson.id));
      if (!silent) setMessage(null);
    } catch {
      if (!silent) setMessage(t("schedule.lessonAccessPanel.error"));
    } finally {
      if (!silent) setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 5000);
    return () => window.clearInterval(timer);
  }, [lesson.id]);

  async function act(action: () => Promise<unknown>, successKey: string) {
    setBusy(true);
    try {
      const result = await action() as { status?: string } | undefined;
      setMessage(result?.status === "KICKED_PARTIAL_CLEANUP"
        ? t("schedule.lessonAccessPanel.partialKick")
        : t(successKey));
      await refresh(true);
    } catch {
      setMessage(t("schedule.lessonAccessPanel.error"));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    setBusy(true);
    try {
      const result = await copyTextFromPromise(fetchLessonAccessLink(lesson.id).then((link) => link.url));
      setMessage(t(result.copied ? "schedule.lessonAccessPanel.copied" : "schedule.lessonAccessPanel.copyFailed"));
    } catch {
      setMessage(t("schedule.lessonAccessPanel.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-border bg-background p-4" aria-labelledby="lesson-admission-title">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-extrabold" id="lesson-admission-title">{t("schedule.lessonAccessPanel.title")}</h2>
        <Button aria-label={t("common.actions.refresh")} className="h-10 w-10 p-0" disabled={busy} onClick={() => void refresh()} type="button" variant="outline">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t("schedule.lessonAccessPanel.description")}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void copyLink()} type="button" variant="outline"><Copy className="h-4 w-4" />{t("schedule.lessonAccessPanel.copy")}</Button>
        <Button disabled={busy} onClick={() => void act(() => rotateLessonAccessLink(lesson.id), "schedule.lessonAccessPanel.rotated")} type="button" variant="outline"><RotateCw className="h-4 w-4" />{t("schedule.lessonAccessPanel.rotate")}</Button>
        <Button disabled={busy} onClick={() => void act(() => revokeLessonAccessLink(lesson.id), "schedule.lessonAccessPanel.revoked")} type="button" variant="outline"><Ban className="h-4 w-4" />{t("schedule.lessonAccessPanel.revoke")}</Button>
      </div>

      <div className="mt-4 grid gap-3">
        {overview?.pendingLobby.map((entry) => (
          <div className="rounded-xl border border-border p-3" key={entry.attemptId}>
            <strong className="text-sm">{entry.displayLabel}</strong>
            <select
              aria-label={t("schedule.lessonAccessPanel.mapStudent")}
              className="playsay-input mt-2"
              onChange={(event) => setSelection((current) => ({ ...current, [entry.attemptId]: event.target.value }))}
              value={selection[entry.attemptId] ?? ""}
            >
              <option value="">{t("schedule.lessonAccessPanel.chooseStudent")}</option>
              {lesson.participants.map((participant) => (
                <option key={participant.subject} value={participant.subject}>
                  {participant.displayName ?? participant.username ?? participant.subject}
                </option>
              ))}
            </select>
            <div className="mt-2 flex gap-2">
              <Button disabled={busy || !selection[entry.attemptId]} onClick={() => void act(
                () => approveLessonLobby(lesson.id, entry.attemptId, selection[entry.attemptId]),
                "schedule.lessonAccessPanel.approved",
              )} type="button"><Check className="h-4 w-4" />{t("schedule.lessonAccessPanel.approve")}</Button>
              <Button disabled={busy} onClick={() => void act(() => denyLessonLobby(lesson.id, entry.attemptId), "schedule.lessonAccessPanel.denied")} type="button" variant="outline"><UserX className="h-4 w-4" />{t("schedule.lessonAccessPanel.deny")}</Button>
            </div>
          </div>
        ))}
        {overview && overview.pendingLobby.length === 0 ? <p className="text-sm text-muted-foreground">{t("schedule.lessonAccessPanel.noPending")}</p> : null}
      </div>

      <div className="mt-4 grid gap-2">
        {lesson.participants.map((participant) => {
          const admission = overview?.admissions.find((item) => item.subject === participant.subject);
          const kicked = admission?.status === "KICKED";
          return (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/50 p-3" key={participant.subject}>
              <span className="text-sm font-semibold">{participant.displayName ?? participant.username ?? participant.subject} · {admission?.status ?? "PENDING"}</span>
              <Button disabled={busy} onClick={() => void act(
                () => changeLessonAdmission(lesson.id, participant.subject, kicked ? "readmit" : "kick", admission?.revision),
                kicked ? "schedule.lessonAccessPanel.readmitted" : "schedule.lessonAccessPanel.kicked",
              )} type="button" variant="outline">
                {kicked ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                {t(kicked ? "schedule.lessonAccessPanel.readmit" : "schedule.lessonAccessPanel.kick")}
              </Button>
            </div>
          );
        })}
      </div>
      {message ? <p aria-live="polite" className="mt-3 text-xs font-semibold text-muted-foreground">{message}</p> : null}
    </section>
  );
}
