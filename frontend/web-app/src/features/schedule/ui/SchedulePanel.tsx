import { useState } from "react";
import { ChevronDown, Loader2, RefreshCw, Video } from "lucide-react";
import { classroomPath } from "../../../app/routes";
import {
  compareScheduleLessons,
  flattenCourseLessonOptions,
  isJoinableScheduledLesson,
  type CourseLessonMap,
} from "../../../entities/schedule/model";
import { Button } from "../../../components/ui/button";
import type {
  AdminUserProfile,
  Course,
  MeProfile,
  ScheduledLesson,
  ScheduledLessonInput,
} from "../../../shared/api/playsay";
import { ScheduleCreateForm } from "./ScheduleCreateForm";
import { ScheduledLessonCard } from "./ScheduledLessonCard";
import { useAppTranslation } from "../../../shared/i18n";

const SCHEDULE_VISIBLE_LESSON_LIMIT = 10;

export function SchedulePanel({
  courses,
  disabled,
  lessons,
  loading,
  message,
  nowMs,
  onCancel,
  onCreate,
  onDelete,
  onJoin,
  onRefresh,
  profile,
  roomLoadingLessonId,
  roomMessage,
  scheduledLessons,
  studentUsers,
}: {
  courses: Course[];
  disabled: boolean;
  lessons: CourseLessonMap;
  loading: boolean;
  message: string | null;
  nowMs: number;
  onCancel: (lesson: ScheduledLesson) => void;
  onCreate: (input: ScheduledLessonInput) => void;
  onDelete: (lessonId: string) => void;
  onJoin: (lesson: ScheduledLesson) => void;
  onRefresh: () => void;
  profile: MeProfile | null;
  roomLoadingLessonId: string | null;
  roomMessage: string | null;
  scheduledLessons: ScheduledLesson[];
  studentUsers: AdminUserProfile[];
}) {
  const { t } = useAppTranslation();
  const canManage = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
  const lessonOptions = flattenCourseLessonOptions(courses, lessons);
  const orderedLessons = [...scheduledLessons].sort((left, right) => compareScheduleLessons(left, right, nowMs));
  const visibleLessons = orderedLessons.slice(0, SCHEDULE_VISIBLE_LESSON_LIMIT);
  const archivedLessons = orderedLessons.slice(SCHEDULE_VISIBLE_LESSON_LIMIT);
  const [copiedLessonId, setCopiedLessonId] = useState<string | null>(null);
  const archiveTitle = archivedLessons.every((lesson) => !isJoinableScheduledLesson(lesson, nowMs))
    ? t("schedule.archive.old")
    : t("schedule.archive.more");

  async function copyLessonLink(lessonId: string) {
    const url = new URL(classroomPath(lessonId), window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLessonId(lessonId);
      window.setTimeout(() => {
        setCopiedLessonId((current) => (current === lessonId ? null : current));
      }, 1800);
    } catch {
      window.prompt(t("schedule.clipboard.promptTitle"), url);
    }
  }

  const renderLessonCard = (lesson: ScheduledLesson) => (
    <ScheduledLessonCard
      canManage={canManage}
      disabled={disabled}
      key={lesson.id}
      lesson={lesson}
      linkCopied={copiedLessonId === lesson.id}
      nowMs={nowMs}
      onCancel={() => onCancel(lesson)}
      onCopyLink={() => void copyLessonLink(lesson.id)}
      onDelete={() => onDelete(lesson.id)}
      onJoin={() => onJoin(lesson)}
      roomLoading={roomLoadingLessonId === lesson.id}
    />
  );

  return (
    <section className="rounded-[1.25rem] border border-border bg-white/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <Video className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-extrabold">{t("schedule.title")}</h2>
        </div>
        <Button disabled={disabled} onClick={onRefresh} type="button" variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t("common.actions.refresh")}
        </Button>
      </div>

      {!profile ? (
        <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
          {t("schedule.loginRequired")}
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          {canManage ? (
            <ScheduleCreateForm
              disabled={disabled}
              lessonOptions={lessonOptions}
              onCreate={onCreate}
              studentUsers={studentUsers}
            />
          ) : null}

          {message ? (
            <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
              {message}
            </div>
          ) : null}

          {roomMessage ? (
            <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
              {roomMessage}
            </div>
          ) : null}

          {scheduledLessons.length === 0 ? (
            <div className="rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
              {canManage ? t("schedule.empty.manager") : t("schedule.empty.student")}
            </div>
          ) : (
            <div className="grid gap-3">
              {visibleLessons.map(renderLessonCard)}
              {archivedLessons.length > 0 ? (
                <details className="group rounded-2xl border border-border bg-muted/45">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-extrabold text-foreground">
                    <span>{archiveTitle}</span>
                    <span className="inline-flex items-center gap-2 text-xs font-extrabold text-muted-foreground">
                      {t("schedule.archive.hiddenCount", { count: archivedLessons.length })}
                      <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                    </span>
                  </summary>
                  <div className="grid gap-3 border-t border-border p-3">
                    {archivedLessons.map(renderLessonCard)}
                  </div>
                </details>
              ) : null}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
