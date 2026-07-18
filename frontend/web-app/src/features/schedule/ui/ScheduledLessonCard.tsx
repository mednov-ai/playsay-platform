import { BookOpen, CalendarClock, CheckCircle2, Copy, EllipsisVertical, Loader2, Play, RotateCcw, Trash2, Video } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  formatDateTime,
  formatLessonType,
  isArchivedScheduleLesson,
  isJoinableScheduledLesson,
  isScheduledLessonReadyToStart,
  scheduleStateLabel,
} from "../../../entities/schedule/model";
import type { ScheduledLesson } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

export function ScheduledLessonCard({
  canManage,
  disabled,
  lesson,
  linkCopied,
  nowMs,
  onCancel,
  onComplete,
  onCopyLink,
  onDelete,
  onJoin,
  onStart,
  onPrepare = () => undefined,
  onReschedule = () => undefined,
  roomLoading,
}: {
  canManage: boolean;
  disabled: boolean;
  lesson: ScheduledLesson;
  linkCopied: boolean;
  nowMs: number;
  onCancel: () => void;
  onComplete: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
  onJoin: () => void;
  onStart: () => void;
  onPrepare?: () => void;
  onReschedule?: () => void;
  roomLoading: boolean;
}) {
  const { t } = useAppTranslation();
  const translate = (key: string, options?: Record<string, unknown>) => t(key, options);
  const joinable = isJoinableScheduledLesson(lesson, nowMs);
  const archived = isArchivedScheduleLesson(lesson, nowMs);
  const readyToStart = canManage && isScheduledLessonReadyToStart(lesson, nowMs);
  const teacherLessonLive = canManage && joinable;
  const stateLabel = scheduleStateLabel(lesson, nowMs, translate);

  return (
    <article
      className={`playsay-schedule-card${readyToStart || teacherLessonLive ? " playsay-schedule-card--actionable" : ""}`}
      data-lesson-action={readyToStart ? "start" : teacherLessonLive ? "join" : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-extrabold">
              {lesson.lessonTitle ?? lesson.courseTitle ?? t("schedule.lessonFallbackTitle")}
            </h3>
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-extrabold text-muted-foreground">
              {stateLabel}
            </span>
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-extrabold text-muted-foreground">
              {formatLessonType(lesson.type, translate)}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">
            {formatDateTime(lesson.scheduledStart, translate)} — {formatDateTime(lesson.scheduledEnd, translate)}
          </p>
          <p className="mt-1 text-xs font-bold text-muted-foreground">
            {lesson.courseTitle ?? t("schedule.fallback.course")} · {lesson.teacherName ?? t("schedule.fallback.teacher")}
          </p>
          {lesson.materialTitle ? (
            <p className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-[#fff3eb] px-2.5 py-1 text-xs font-extrabold text-primary">
              <BookOpen className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{lesson.materialTitle}</span>
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {lesson.participants.length === 0 ? (
              <span className="rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-extrabold text-muted-foreground">
                {t("schedule.participants.none")}
              </span>
            ) : (
              lesson.participants.map((participant) => (
                <span
                  className="rounded-full border border-primary/20 bg-white px-3 py-1 text-xs font-extrabold text-primary"
                  key={participant.subject}
                >
                  {participant.displayName ?? participant.username ?? participant.subject}
                </span>
              ))
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {readyToStart ? (
            <>
              <Button
                className="playsay-lesson-invite"
                data-lesson-invite-location="card"
                disabled={disabled || roomLoading}
                onClick={onStart}
                type="button"
              >
                {roomLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {t("schedule.actions.start")}
              </Button>
              <Button disabled={disabled || roomLoading} onClick={onPrepare} type="button" variant="outline">
                <BookOpen className="h-4 w-4" />
                {t("schedule.actions.prepareShort")}
              </Button>
            </>
          ) : canManage && !archived && !teacherLessonLive ? (
            <Button disabled={disabled} onClick={onPrepare} type="button">
              <BookOpen className="h-4 w-4" />
              {t("schedule.actions.prepare")}
            </Button>
          ) : joinable || teacherLessonLive ? (
            <Button
              className={teacherLessonLive ? "playsay-lesson-invite" : undefined}
              data-lesson-invite-location={teacherLessonLive ? "card" : undefined}
              disabled={disabled || roomLoading}
              onClick={onJoin}
              type="button"
            >
              {roomLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
              {t("schedule.actions.join")}
            </Button>
          ) : (
            <span className="playsay-schedule-join-note" data-schedule-join-status="closed">
              {archived ? stateLabel : t("schedule.actions.joinWindowHint")}
            </span>
          )}
          {!canManage ? (
            <Button disabled={disabled} onClick={onCopyLink} type="button" variant="outline">
              <Copy className="h-4 w-4" />{linkCopied ? t("schedule.clipboard.copied") : t("schedule.clipboard.link")}
            </Button>
          ) : (
            <details className="playsay-schedule-card-menu">
              <summary aria-label={t("schedule.actions.more")}><EllipsisVertical className="h-4 w-4" /></summary>
              <div>
                <button disabled={disabled} onClick={onCopyLink} type="button"><Copy />{linkCopied ? t("schedule.clipboard.copied") : t("schedule.actions.copyLinks")}</button>
                {!archived ? <button disabled={disabled} onClick={onReschedule} type="button"><CalendarClock />{t("schedule.actions.reschedule")}</button> : null}
                {!archived ? <button disabled={disabled} onClick={() => window.confirm(t("schedule.confirm.complete")) && onComplete()} type="button"><CheckCircle2 />{t("schedule.actions.complete")}</button> : null}
                {!archived ? <button disabled={disabled} onClick={() => window.confirm(t("schedule.confirm.cancel")) && onCancel()} type="button"><RotateCcw />{t("schedule.actions.cancel")}</button> : null}
                <button disabled={disabled} onClick={() => window.confirm(t("schedule.confirm.delete")) && onDelete()} type="button"><Trash2 />{t("schedule.actions.delete")}</button>
              </div>
            </details>
          )}
        </div>
      </div>
    </article>
  );
}
