import { useEffect, useState, type FormEvent } from "react";
import { BookOpen, ChevronDown, Copy, Loader2, Plus, RefreshCw, RotateCcw, Trash2, Video } from "lucide-react";
import { classroomPath } from "../../../app/routes";
import {
  compareScheduleLessons,
  defaultScheduleForm,
  flattenCourseLessonOptions,
  formatDateTime,
  formatLessonType,
  isJoinableScheduledLesson,
  localDateTimeToIso,
  scheduleStateLabel,
  selectedParticipantSubjects,
  type CourseLessonMap,
  type ScheduleFormState,
} from "../../../entities/schedule/model";
import { Button } from "../../../components/ui/button";
import { FormField } from "../../../shared/ui/FormField";
import type {
  AdminUserProfile,
  Course,
  MeProfile,
  ScheduledLesson,
  ScheduledLessonInput,
} from "../../../shared/api/playsay";

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
  const canManage = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
  const lessonOptions = flattenCourseLessonOptions(courses, lessons);
  const orderedLessons = [...scheduledLessons].sort((left, right) => compareScheduleLessons(left, right, nowMs));
  const visibleLessons = orderedLessons.slice(0, SCHEDULE_VISIBLE_LESSON_LIMIT);
  const archivedLessons = orderedLessons.slice(SCHEDULE_VISIBLE_LESSON_LIMIT);
  const [copiedLessonId, setCopiedLessonId] = useState<string | null>(null);
  const archiveTitle = archivedLessons.every((lesson) => !isJoinableScheduledLesson(lesson, nowMs))
    ? "Старые занятия"
    : "Ещё занятия";

  async function copyLessonLink(lessonId: string) {
    const url = new URL(classroomPath(lessonId), window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLessonId(lessonId);
      window.setTimeout(() => {
        setCopiedLessonId((current) => (current === lessonId ? null : current));
      }, 1800);
    } catch {
      window.prompt("Ссылка на урок", url);
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
          <h2 className="text-lg font-extrabold">Расписание</h2>
        </div>
        <Button disabled={disabled} onClick={onRefresh} type="button" variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Обновить
        </Button>
      </div>

      {!profile ? (
        <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
          Войдите, чтобы увидеть расписание.
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
              {canManage ? "В расписании пока нет занятий." : "У вас пока нет запланированных занятий."}
            </div>
          ) : (
            <div className="grid gap-3">
              {visibleLessons.map(renderLessonCard)}
              {archivedLessons.length > 0 ? (
                <details className="group rounded-2xl border border-border bg-muted/45">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-extrabold text-foreground">
                    <span>{archiveTitle}</span>
                    <span className="inline-flex items-center gap-2 text-xs font-extrabold text-muted-foreground">
                      скрыто {archivedLessons.length}
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

function ScheduleCreateForm({
  disabled,
  lessonOptions,
  onCreate,
  studentUsers,
}: {
  disabled: boolean;
  lessonOptions: Array<{ id: string; label: string }>;
  onCreate: (input: ScheduledLessonInput) => void;
  studentUsers: AdminUserProfile[];
}) {
  const [form, setForm] = useState<ScheduleFormState>(() => defaultScheduleForm(lessonOptions[0]?.id ?? ""));

  useEffect(() => {
    setForm((current) => (
      current.lessonTemplateId || lessonOptions.length === 0
        ? current
        : { ...current, lessonTemplateId: lessonOptions[0].id }
    ));
  }, [lessonOptions]);

  function updateField<Key extends keyof ScheduleFormState>(field: Key, value: ScheduleFormState[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleParticipant(subject: string) {
    setForm((current) => {
      const selected = selectedParticipantSubjects(current.participantSubjects);
      const next = selected.includes(subject)
        ? selected.filter((item) => item !== subject)
        : [...selected, subject];
      return { ...current, participantSubjects: next.join(", ") };
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({
      lessonTemplateId: form.lessonTemplateId || null,
      materialId: null,
      scheduledStart: localDateTimeToIso(form.scheduledStart),
      scheduledEnd: localDateTimeToIso(form.scheduledEnd),
      status: "SCHEDULED",
      type: form.type,
      participantSubjects: form.participantSubjects
        .split(",")
        .map((subject) => subject.trim())
        .filter(Boolean),
    });
  }

  return (
    <form className="grid gap-3 rounded-2xl border border-border bg-muted/50 p-3" onSubmit={submit}>
      <FormField label="Урок курса">
        <select
          className="playsay-input"
          disabled={disabled}
          onChange={(event) => updateField("lessonTemplateId", event.target.value)}
          value={form.lessonTemplateId}
        >
          <option value="">Без шаблона</option>
          {lessonOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </FormField>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Начало">
          <input
            className="playsay-input"
            disabled={disabled}
            onChange={(event) => updateField("scheduledStart", event.target.value)}
            required
            type="datetime-local"
            value={form.scheduledStart}
          />
        </FormField>
        <FormField label="Конец">
          <input
            className="playsay-input"
            disabled={disabled}
            onChange={(event) => updateField("scheduledEnd", event.target.value)}
            required
            type="datetime-local"
            value={form.scheduledEnd}
          />
        </FormField>
      </div>

      <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
        <FormField label="Формат">
          <select
            className="playsay-input"
            disabled={disabled}
            onChange={(event) => updateField("type", event.target.value as ScheduleFormState["type"])}
            value={form.type}
          >
            <option value="GROUP">Группа</option>
            <option value="INDIVIDUAL">Индивидуально</option>
          </select>
        </FormField>
        <FormField label="Ученики">
          {studentUsers.length === 0 ? (
            <input
              className="playsay-input"
              disabled={disabled}
              onChange={(event) => updateField("participantSubjects", event.target.value)}
              placeholder="Ученики появятся после первого входа"
              value={form.participantSubjects}
            />
          ) : (
            <div className="grid gap-2 rounded-2xl border border-border bg-background p-3">
              {studentUsers.map((student) => {
                const selected = selectedParticipantSubjects(form.participantSubjects).includes(student.subject);
                return (
                  <label className="flex items-center justify-between gap-3 text-sm font-extrabold" key={student.subject}>
                    <span className="min-w-0 truncate">
                      {student.displayName ?? student.name ?? student.username ?? student.subject}
                    </span>
                    <input
                      checked={selected}
                      disabled={disabled}
                      onChange={() => toggleParticipant(student.subject)}
                      type="checkbox"
                    />
                  </label>
                );
              })}
            </div>
          )}
        </FormField>
      </div>

      <div className="flex justify-end">
        <Button disabled={disabled} type="submit">
          <Plus className="h-4 w-4" />
          Добавить занятие
        </Button>
      </div>
    </form>
  );
}

function ScheduledLessonCard({
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
  const joinable = isJoinableScheduledLesson(lesson, nowMs);
  const stateLabel = scheduleStateLabel(lesson, nowMs);

  return (
    <article className="rounded-2xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-extrabold">
              {lesson.lessonTitle ?? lesson.courseTitle ?? "Занятие"}
            </h3>
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-extrabold text-muted-foreground">
              {stateLabel}
            </span>
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-extrabold text-muted-foreground">
              {formatLessonType(lesson.type)}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">
            {formatDateTime(lesson.scheduledStart)} — {formatDateTime(lesson.scheduledEnd)}
          </p>
          <p className="mt-1 text-xs font-bold text-muted-foreground">
            {lesson.courseTitle ?? "Курс позже"} · {lesson.teacherName ?? "Преподаватель позже"}
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
                ученики позже
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
            Войти в урок
          </Button>
          <Button disabled={disabled} onClick={onCopyLink} type="button" variant="outline">
            <Copy className="h-4 w-4" />
            {linkCopied ? "Скопировано" : "Ссылка"}
          </Button>
          {canManage ? (
            <>
            <Button disabled={disabled || lesson.status === "CANCELLED"} onClick={onCancel} type="button" variant="outline">
              <RotateCcw className="h-4 w-4" />
              Отменить
            </Button>
            <Button disabled={disabled} onClick={onDelete} type="button" variant="outline">
              <Trash2 className="h-4 w-4" />
              Удалить
            </Button>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}

