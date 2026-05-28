import { BookOpen, Copy, Loader2, RotateCcw, Trash2, Video } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { formatDateTime, formatLessonType, isJoinableScheduledLesson, scheduleStateLabel } from "../../../entities/schedule/model";
import type { ScheduledLesson } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

export function ScheduledLessonCard({
  canManage,
  disabled,
  lesson,
  linkCopied,
  nowMs,
  onCancel,
  onCopyLink,
  onDelete,
  onJoin,
  roomLoading,
}: {
  canManage: boolean;
  disabled: boolean;
  lesson: ScheduledLesson;
  linkCopied: boolean;
  nowMs: number;
  onCancel: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
  onJoin: () => void;
  roomLoading: boolean;
}) {
  const { t } = useAppTranslation();
  const translate = (key: string, options?: Record<string, unknown>) => t(key, options);
  const joinable = isJoinableScheduledLesson(lesson, nowMs);
  const stateLabel = scheduleStateLabel(lesson, nowMs, translate);

  return (
    <article className="rounded-2xl border border-border bg-white p-4">
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
          <Button
            disabled={disabled || roomLoading || !joinable}
            onClick={onJoin}
            type="button"
          >
            {roomLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            {t("schedule.actions.join")}
          </Button>
          <Button disabled={disabled} onClick={onCopyLink} type="button" variant="outline">
            <Copy className="h-4 w-4" />
            {linkCopied ? t("schedule.clipboard.copied") : t("schedule.clipboard.link")}
          </Button>
          {canManage ? (
            <>
              <Button disabled={disabled || lesson.status === "CANCELLED"} onClick={onCancel} type="button" variant="outline">
                <RotateCcw className="h-4 w-4" />
                {t("schedule.actions.cancel")}
              </Button>
              <Button disabled={disabled} onClick={onDelete} type="button" variant="outline">
                <Trash2 className="h-4 w-4" />
                {t("schedule.actions.delete")}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
