import { useState } from "react";
import { Archive, CalendarDays, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { classroomPath } from "../../../app/routes";
import {
  flattenCourseLessonOptions,
  splitScheduleLessonsForDashboard,
  type CourseLessonMap,
} from "../../../entities/schedule/model";
import { Button } from "../../../components/ui/button";
import type {
  AdminUserProfile,
  Course,
  LessonMaterial,
  ManagedStudentInput,
  MeProfile,
  ScheduledLesson,
  ScheduledLessonInput,
} from "../../../shared/api/playsay";
import { ScheduleCreateForm } from "./ScheduleCreateForm";
import { ScheduledLessonCard } from "./ScheduledLessonCard";
import { useAppTranslation } from "../../../shared/i18n";

export function SchedulePanel({
  courses,
  disabled,
  lessons,
  loading,
  materials,
  message,
  nowMs,
  onCancel,
  onComplete,
  onCopyLinks,
  onCreate,
  onCreateManagedStudent,
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
  materials: LessonMaterial[];
  message: string | null;
  nowMs: number;
  onCancel: (lesson: ScheduledLesson) => void;
  onComplete: (lesson: ScheduledLesson) => void;
  onCopyLinks: (lesson: ScheduledLesson) => Promise<boolean>;
  onCreate: (input: ScheduledLessonInput) => void;
  onCreateManagedStudent: (input: ManagedStudentInput) => Promise<AdminUserProfile | null>;
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
  const { archivedLessons, mainLessons } = splitScheduleLessonsForDashboard(scheduledLessons, nowMs);
  const [copiedLessonId, setCopiedLessonId] = useState<string | null>(null);

  async function copyLessonLink(lesson: ScheduledLesson) {
    if (canManage) {
      if (await onCopyLinks(lesson)) {
        markCopied(lesson.id);
      }
      return;
    }

    const url = new URL(classroomPath(lesson.id), window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      markCopied(lesson.id);
    } catch {
      window.prompt(t("schedule.clipboard.promptTitle"), url);
    }
  }

  function markCopied(lessonId: string) {
    setCopiedLessonId(lessonId);
    window.setTimeout(() => {
      setCopiedLessonId((current) => (current === lessonId ? null : current));
    }, 1800);
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
      onComplete={() => onComplete(lesson)}
      onCopyLink={() => void copyLessonLink(lesson)}
      onDelete={() => onDelete(lesson.id)}
      onJoin={() => onJoin(lesson)}
      roomLoading={roomLoadingLessonId === lesson.id}
    />
  );

  const emptyMainMessage = canManage ? t("schedule.empty.noUpcomingManager") : t("schedule.empty.noUpcomingStudent");

  return (
    <section className="playsay-schedule-shell">
      <div className="playsay-schedule-header">
        <div>
          <span className="playsay-schedule-eyebrow">
            <CalendarDays className="h-4 w-4" />
            {t("schedule.title")}
          </span>
          <h2>{canManage ? t("schedule.dashboard.teacherTitle") : t("schedule.dashboard.studentTitle")}</h2>
          <p>{canManage ? t("schedule.dashboard.teacherSubtitle") : t("schedule.dashboard.studentSubtitle")}</p>
        </div>
        <Button disabled={disabled} onClick={onRefresh} type="button" variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t("common.actions.refresh")}
        </Button>
      </div>
      {!profile ? (
        <div className="playsay-schedule-empty">
          {t("schedule.loginRequired")}
        </div>
      ) : (
        <div className={canManage ? "playsay-schedule-dashboard-grid" : "playsay-schedule-dashboard-grid playsay-schedule-dashboard-grid--single"}>
          <div className="playsay-schedule-list-panel">
            <div className="playsay-schedule-list-head">
              <div>
                <h3>{t("schedule.dashboard.upcomingTitle")}</h3>
                <p>{t("schedule.dashboard.upcomingSubtitle")}</p>
              </div>
              <span>{mainLessons.length}</span>
            </div>

            {message ? (
              <div className="playsay-schedule-message">
                {message}
              </div>
            ) : null}

            {roomMessage ? (
              <div className="playsay-schedule-message">
                {roomMessage}
              </div>
            ) : null}

            {mainLessons.length === 0 ? (
              <div className="playsay-schedule-empty" data-schedule-primary-list="true">
                {scheduledLessons.length === 0
                  ? canManage ? t("schedule.empty.manager") : t("schedule.empty.student")
                  : emptyMainMessage}
              </div>
            ) : (
              <div className="playsay-schedule-timeline" data-schedule-primary-list="true">
                {mainLessons.map(renderLessonCard)}
              </div>
            )}

            {archivedLessons.length > 0 ? (
              <details className="playsay-schedule-archive" data-schedule-archive="true">
                <summary>
                  <span className="inline-flex items-center gap-2">
                    <Archive className="h-4 w-4" />
                    {t("schedule.archive.old")}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    {t("schedule.archive.hiddenCount", { count: archivedLessons.length })}
                    <ChevronDown className="h-4 w-4 transition-transform" />
                  </span>
                </summary>
                <div>
                  {archivedLessons.map(renderLessonCard)}
                </div>
              </details>
            ) : null}
          </div>

          {canManage ? (
            <div className="playsay-schedule-create-panel">
              <ScheduleCreateForm
                disabled={disabled}
                lessonOptions={lessonOptions}
                managedStudentLoading={loading}
                managedStudentMessage={message}
                materials={materials}
                onCreate={onCreate}
                onCreateManagedStudent={onCreateManagedStudent}
                studentUsers={studentUsers}
              />
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
