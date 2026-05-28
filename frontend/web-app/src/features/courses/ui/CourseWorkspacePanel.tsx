import { useState, type FormEvent } from "react";
import { BookOpen, CalendarDays, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { formatDuration, type CourseLessonMap } from "../../../entities/schedule/model";
import { Button } from "../../../components/ui/button";
import { FormField } from "../../../shared/ui/FormField";
import { parseOptionalNumber } from "../../../shared/utils/number";
import type {
  Course,
  CourseInput,
  CourseLesson,
  CourseLessonInput,
  MeProfile,
} from "../../../shared/api/playsay";

type CourseFormState = {
  title: string;
  description: string;
  level: string;
  language: string;
  isPublished: boolean;
};

type LessonFormState = {
  title: string;
  orderIndex: string;
  plannedDurationMin: string;
};

export function CourseWorkspacePanel({
  courses,
  disabled,
  lessons,
  loading,
  message,
  onCreateCourse,
  onCreateLesson,
  onDeleteCourse,
  onDeleteLesson,
  onRefresh,
  profile,
}: {
  courses: Course[];
  disabled: boolean;
  lessons: CourseLessonMap;
  loading: boolean;
  message: string | null;
  onCreateCourse: (input: CourseInput) => void;
  onCreateLesson: (courseId: string, input: CourseLessonInput) => void;
  onDeleteCourse: (courseId: string) => void;
  onDeleteLesson: (courseId: string, lessonId: string) => void;
  onRefresh: () => void;
  profile: MeProfile | null;
}) {
  const canManage = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;

  return (
    <section className="rounded-[1.25rem] border border-border bg-white/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-extrabold">Курсы и уроки</h2>
        </div>
        <Button disabled={disabled} onClick={onRefresh} type="button" variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Обновить
        </Button>
      </div>

      {!profile ? (
        <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
          Войдите, чтобы увидеть учебные программы.
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          {canManage ? (
            <CourseCreateForm disabled={disabled} onCreate={onCreateCourse} />
          ) : null}

          {message ? (
            <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
              {message}
            </div>
          ) : null}

          {courses.length === 0 ? (
            <div className="rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
              {canManage ? "Курсов пока нет. Создайте первую программу." : "Опубликованных курсов пока нет."}
            </div>
          ) : (
            <div className="grid gap-3">
              {courses.map((course) => (
                <CourseCard
                  canManage={canManage}
                  course={course}
                  disabled={disabled}
                  key={course.id}
                  lessons={lessons[course.id] ?? []}
                  onCreateLesson={(input) => onCreateLesson(course.id, input)}
                  onDeleteCourse={() => onDeleteCourse(course.id)}
                  onDeleteLesson={(lessonId) => onDeleteLesson(course.id, lessonId)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CourseCreateForm({
  disabled,
  onCreate,
}: {
  disabled: boolean;
  onCreate: (input: CourseInput) => void;
}) {
  const [form, setForm] = useState<CourseFormState>({
    title: "",
    description: "",
    level: "A1",
    language: "en",
    isPublished: true,
  });

  function updateField<Key extends keyof CourseFormState>(field: Key, value: CourseFormState[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({
      title: form.title,
      description: form.description,
      level: form.level,
      language: form.language || "en",
      isPublished: form.isPublished,
    });
    setForm((current) => ({ ...current, title: "", description: "" }));
  }

  return (
    <form className="grid gap-3 rounded-2xl border border-border bg-muted/50 p-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem_7rem]">
        <FormField label="Название курса">
          <input
            className="playsay-input"
            disabled={disabled}
            maxLength={160}
            onChange={(event) => updateField("title", event.target.value)}
            placeholder="English A1"
            required
            value={form.title}
          />
        </FormField>
        <FormField label="Уровень">
          <input
            className="playsay-input"
            disabled={disabled}
            maxLength={16}
            onChange={(event) => updateField("level", event.target.value)}
            value={form.level}
          />
        </FormField>
        <FormField label="Язык">
          <input
            className="playsay-input"
            disabled={disabled}
            maxLength={16}
            onChange={(event) => updateField("language", event.target.value)}
            value={form.language}
          />
        </FormField>
      </div>
      <FormField label="Описание">
        <textarea
          className="playsay-input min-h-20 resize-none py-3"
          disabled={disabled}
          maxLength={2_000}
          onChange={(event) => updateField("description", event.target.value)}
          placeholder="Короткое описание программы"
          value={form.description}
        />
      </FormField>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-extrabold text-muted-foreground">
          <input
            checked={form.isPublished}
            disabled={disabled}
            onChange={(event) => updateField("isPublished", event.target.checked)}
            type="checkbox"
          />
          Опубликован
        </label>
        <Button disabled={disabled || form.title.trim().length === 0} type="submit">
          <Plus className="h-4 w-4" />
          Создать курс
        </Button>
      </div>
    </form>
  );
}

function CourseCard({
  canManage,
  course,
  disabled,
  lessons,
  onCreateLesson,
  onDeleteCourse,
  onDeleteLesson,
}: {
  canManage: boolean;
  course: Course;
  disabled: boolean;
  lessons: CourseLesson[];
  onCreateLesson: (input: CourseLessonInput) => void;
  onDeleteCourse: () => void;
  onDeleteLesson: (lessonId: string) => void;
}) {
  return (
    <article className="rounded-2xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-extrabold">{course.title}</h3>
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-extrabold text-muted-foreground">
              {course.level ?? "level later"}
            </span>
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-extrabold text-muted-foreground">
              {course.isPublished ? "published" : "draft"}
            </span>
          </div>
          {course.description ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{course.description}</p>
          ) : null}
          <p className="mt-2 text-xs font-bold text-muted-foreground">
            {course.lessonCount} уроков · обновлено {new Date(course.updatedAt).toLocaleString()}
          </p>
        </div>
        {canManage ? (
          <Button disabled={disabled} onClick={onDeleteCourse} type="button" variant="outline">
            <Trash2 className="h-4 w-4" />
            Удалить
          </Button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2">
        {lessons.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/50 p-3 text-sm font-semibold text-muted-foreground">
            Уроки ещё не добавлены.
          </div>
        ) : (
          lessons.map((lesson) => (
            <CourseLessonRow
              canManage={canManage}
              disabled={disabled}
              key={lesson.id}
              lesson={lesson}
              onDelete={() => onDeleteLesson(lesson.id)}
            />
          ))
        )}
      </div>

      {canManage ? <CourseLessonCreateForm disabled={disabled} onCreate={onCreateLesson} /> : null}
    </article>
  );
}

function CourseLessonRow({
  canManage,
  disabled,
  lesson,
  onDelete,
}: {
  canManage: boolean;
  disabled: boolean;
  lesson: CourseLesson;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/45 p-3">
      <div>
        <div className="text-sm font-extrabold">{lesson.title}</div>
        <div className="mt-1 text-xs font-bold text-muted-foreground">
          № {lesson.orderIndex ?? "?"} · {formatDuration(lesson.plannedDurationMin)}
        </div>
        {lesson.materialTitle ? (
          <div className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-[#fff3eb] px-2 py-1 text-xs font-extrabold text-primary">
            <BookOpen className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{lesson.materialTitle}</span>
          </div>
        ) : null}
      </div>
      {canManage ? (
        <Button disabled={disabled} onClick={onDelete} type="button" variant="outline">
          <Trash2 className="h-4 w-4" />
          Удалить
        </Button>
      ) : null}
    </div>
  );
}

function CourseLessonCreateForm({
  disabled,
  onCreate,
}: {
  disabled: boolean;
  onCreate: (input: CourseLessonInput) => void;
}) {
  const [form, setForm] = useState<LessonFormState>({
    title: "",
    orderIndex: "",
    plannedDurationMin: "45",
  });

  function updateField(field: keyof LessonFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({
      title: form.title,
      orderIndex: parseOptionalNumber(form.orderIndex),
      plannedDurationMin: parseOptionalNumber(form.plannedDurationMin),
    });
    setForm((current) => ({ ...current, title: "", orderIndex: "" }));
  }

  return (
    <form className="mt-3 grid gap-2 rounded-xl border border-border bg-muted/35 p-3 sm:grid-cols-[1fr_5rem_6rem_auto]" onSubmit={submit}>
      <input
        className="playsay-input"
        disabled={disabled}
        maxLength={160}
        onChange={(event) => updateField("title", event.target.value)}
        placeholder="Название урока"
        required
        value={form.title}
      />
      <input
        className="playsay-input"
        disabled={disabled}
        min={0}
        onChange={(event) => updateField("orderIndex", event.target.value)}
        placeholder="№"
        type="number"
        value={form.orderIndex}
      />
      <input
        className="playsay-input"
        disabled={disabled}
        max={480}
        min={1}
        onChange={(event) => updateField("plannedDurationMin", event.target.value)}
        placeholder="мин"
        type="number"
        value={form.plannedDurationMin}
      />
      <Button disabled={disabled || form.title.trim().length === 0} type="submit">
        <Plus className="h-4 w-4" />
        Урок
      </Button>
    </form>
  );
}

