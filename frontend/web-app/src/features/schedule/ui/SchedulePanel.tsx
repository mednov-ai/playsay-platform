import { useEffect, useState } from "react";
import { Archive, CalendarDays, CalendarPlus, ChevronDown, Loader2, RefreshCw } from "lucide-react";
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
  ScheduledLessonLinkOrigin,
  ScheduledLessonScheduleInput,
} from "../../../shared/api/playsay";
import { copyTextFromPromise, type ClipboardCopyResult } from "../../../shared/lib/clipboard";
import { LessonAssignmentWizard } from "./LessonAssignmentWizard";
import { LessonRescheduleDialog } from "./LessonRescheduleDialog";
import { ScheduledLessonCard } from "./ScheduledLessonCard";
import { LessonLinksManualCopyDialog } from "./LessonLinksManualCopyDialog";
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
  onOpenMaterials,
  onPrepare,
  onStart,
  onRefresh,
  onReschedule = async () => null,
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
  onCopyLinks: (lesson: ScheduledLesson, linkOrigin?: ScheduledLessonLinkOrigin) => Promise<ClipboardCopyResult | null>;
  onCreate: (input: ScheduledLessonInput) => Promise<ScheduledLesson | null | void> | void;
  onCreateManagedStudent: (input: ManagedStudentInput) => Promise<AdminUserProfile | null>;
  onDelete: (lessonId: string) => void;
  onJoin: (lesson: ScheduledLesson) => void;
  onOpenMaterials?: () => void;
  onPrepare?: (lessonId: string) => void;
  onStart: (lesson: ScheduledLesson) => void;
  onRefresh: () => void;
  onReschedule?: (lessonId: string, input: ScheduledLessonScheduleInput) => Promise<ScheduledLesson | null>;
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
  const [wizardOpen, setWizardOpen] = useState(false);
  const [rescheduleLesson, setRescheduleLesson] = useState<ScheduledLesson | null>(null);
  const [manualCopyText, setManualCopyText] = useState<string | null>(null);
  const showProductionLinkOrigins = typeof window !== "undefined" && isProductionLessonLinkHost(window.location.hostname);

  useEffect(() => {
    function openWizard() {
      setWizardOpen(true);
    }
    window.addEventListener("playsay:assign-lesson", openWizard);
    return () => window.removeEventListener("playsay:assign-lesson", openWizard);
  }, []);

  async function copyLessonLink(lesson: ScheduledLesson, linkOrigin: ScheduledLessonLinkOrigin = "HONEYSCHOOL_RU") {
    if (canManage) {
      const result = await onCopyLinks(lesson, linkOrigin);
      if (result?.copied) {
        markCopied(lesson.id);
      } else if (result) {
        setManualCopyText(result.text);
      }
      return;
    }

    const url = new URL(classroomPath(lesson.id), window.location.origin).toString();
    const result = await copyTextFromPromise(Promise.resolve(url));
    if (result.copied) {
      markCopied(lesson.id);
    } else {
      setManualCopyText(result.text);
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
      onCopyLink={(linkOrigin) => void copyLessonLink(lesson, linkOrigin)}
      onDelete={() => onDelete(lesson.id)}
      onJoin={() => onJoin(lesson)}
      onPrepare={() => onPrepare?.(lesson.id)}
      onReschedule={() => setRescheduleLesson(lesson)}
      onStart={() => onStart(lesson)}
      roomLoading={roomLoadingLessonId === lesson.id}
      showProductionLinkOrigins={showProductionLinkOrigins}
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
        <div className="flex flex-wrap justify-end gap-2">
          {canManage ? (
            <Button data-schedule-open-create="true" disabled={disabled} onClick={() => setWizardOpen(true)} type="button">
              <CalendarPlus className="h-4 w-4" />{t("schedule.wizard.assign")}
            </Button>
          ) : null}
          <Button disabled={disabled} onClick={onRefresh} type="button" variant="outline">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t("common.actions.refresh")}
          </Button>
        </div>
      </div>
      {!profile ? (
        <div className="playsay-schedule-empty">
          {t("schedule.loginRequired")}
        </div>
      ) : (
        <div className="playsay-schedule-dashboard-grid playsay-schedule-dashboard-grid--single">
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
        </div>
      )}
      {canManage ? (
        <LessonAssignmentWizard
          disabled={disabled}
          lessonOptions={lessonOptions}
          managedStudentMessage={message}
          materials={materials}
          onClose={() => setWizardOpen(false)}
          onCreate={onCreate}
          onCreateManagedStudent={onCreateManagedStudent}
          onOpenMaterials={onOpenMaterials ?? (() => undefined)}
          onPrepare={onPrepare ?? (() => undefined)}
          open={wizardOpen}
          studentUsers={studentUsers}
        />
      ) : null}
      {canManage && rescheduleLesson ? (
        <LessonRescheduleDialog
          disabled={disabled}
          lesson={rescheduleLesson}
          onClose={() => setRescheduleLesson(null)}
          onSave={onReschedule}
        />
      ) : null}
      {manualCopyText ? <LessonLinksManualCopyDialog onClose={() => setManualCopyText(null)} text={manualCopyText} /> : null}
    </section>
  );
}

export function isProductionLessonLinkHost(hostname: string): boolean {
  return hostname === "online.honeyschool.ru" || hostname === "online.honey.school";
}
