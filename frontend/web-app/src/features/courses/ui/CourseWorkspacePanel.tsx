import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookMarked,
  Layers3,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Tags,
  Trash2,
} from "lucide-react";
import { formatDuration, type CourseLessonMap } from "../../../entities/schedule/model";
import { Button } from "../../../components/ui/button";
import { FormField } from "../../../shared/ui/FormField";
import { parseOptionalNumber } from "../../../shared/utils/number";
import {
  buildCurriculumBoard,
  type CurriculumLevelTrack,
  type CurriculumTopicCard,
} from "../model/curriculumBoard";
import type {
  Course,
  CourseInput,
  CourseLesson,
  CourseLessonInput,
  CurriculumTopic,
  CurriculumTopicInput,
  LessonMaterial,
  LessonTemplateCardInput,
  LessonTemplateCardsInput,
  MeProfile,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

type CourseFormState = {
  title: string;
  description: string;
  level: string;
  language: string;
  isPublished: boolean;
};

type TopicFormState = {
  title: string;
  description: string;
  orderIndex: string;
  tagSlugs: string;
};

type LessonFormState = {
  title: string;
  orderIndex: string;
  plannedDurationMin: string;
  materialId: string;
};

type LessonCardFormState = {
  materialId: string;
  role: string;
  plannedDurationMin: string;
};

export function CourseWorkspacePanel({
  courses,
  disabled,
  lessons,
  loading,
  materials,
  message,
  onCreateCourse,
  onCreateLesson,
  onCreateTopic,
  onDeleteCourse,
  onDeleteLesson,
  onDeleteTopic,
  onRefresh,
  onReplaceLessonCards,
  onUpdateTopic,
  profile,
  topics,
}: {
  courses: Course[];
  disabled: boolean;
  lessons: CourseLessonMap;
  loading: boolean;
  materials: LessonMaterial[];
  message: string | null;
  onCreateCourse: (input: CourseInput) => void;
  onCreateLesson: (courseId: string, input: CourseLessonInput) => void;
  onCreateTopic: (courseId: string, input: CurriculumTopicInput) => void;
  onDeleteCourse: (courseId: string) => void;
  onDeleteLesson: (courseId: string, lessonId: string) => void;
  onDeleteTopic: (courseId: string, topicId: string) => void;
  onRefresh: () => void;
  onReplaceLessonCards: (courseId: string, lessonId: string, input: LessonTemplateCardsInput) => void;
  onUpdateTopic: (courseId: string, topicId: string, input: CurriculumTopicInput) => void;
  profile: MeProfile | null;
  topics: Record<string, CurriculumTopic[]>;
}) {
  const { t } = useAppTranslation();
  const canManage = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
  const board = useMemo(() => buildCurriculumBoard({ courses, lessons, topics }), [courses, lessons, topics]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const selectedTopic = findTopicCard(board, selectedTopicId);
  const selectedTrack = selectedTopic ? board.find((track) => track.course.id === selectedTopic.topic.courseId) ?? null : null;
  const activeMaterials = materials.filter((material) => material.status !== "ARCHIVED");

  useEffect(() => {
    if (selectedTopic && board.some((track) => track.topics.some((topic) => topic.topic.id === selectedTopic.topic.id))) {
      return;
    }
    const firstTopic = board.flatMap((track) => track.topics)[0];
    setSelectedTopicId(firstTopic?.topic.id ?? "");
  }, [board, selectedTopic]);

  return (
    <section className="rounded-[1.25rem] border border-border bg-white/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <Layers3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-extrabold">{t("courses.title")}</h2>
        </div>
        <Button disabled={disabled} onClick={onRefresh} type="button" variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t("common.actions.refresh")}
        </Button>
      </div>

      {!profile ? (
        <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
          {t("courses.loginRequired")}
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
              {canManage ? t("courses.empty.manager") : t("courses.empty.student")}
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)]">
              <div className="overflow-x-auto pb-2">
                <div className="grid min-w-full auto-cols-[minmax(18rem,1fr)] grid-flow-col gap-3">
                  {board.map((track) => (
                    <LevelTrackColumn
                      canManage={canManage}
                      disabled={disabled}
                      key={track.course.id}
                      onCreateTopic={(input) => onCreateTopic(track.course.id, input)}
                      onDeleteCourse={() => onDeleteCourse(track.course.id)}
                      onSelectTopic={setSelectedTopicId}
                      selectedTopicId={selectedTopicId}
                      track={track}
                    />
                  ))}
                </div>
              </div>

              <TopicInspector
                activeMaterials={activeMaterials}
                canManage={canManage}
                disabled={disabled}
                onCreateLesson={(input) => {
                  if (selectedTrack && selectedTopic) {
                    onCreateLesson(selectedTrack.course.id, input);
                  }
                }}
                onDeleteLesson={(lessonId) => {
                  if (selectedTrack) {
                    onDeleteLesson(selectedTrack.course.id, lessonId);
                  }
                }}
                onDeleteTopic={() => {
                  if (selectedTrack && selectedTopic) {
                    onDeleteTopic(selectedTrack.course.id, selectedTopic.topic.id);
                  }
                }}
                onReplaceLessonCards={(lessonId, input) => {
                  if (selectedTrack) {
                    onReplaceLessonCards(selectedTrack.course.id, lessonId, input);
                  }
                }}
                onUpdateTopic={(input) => {
                  if (selectedTrack && selectedTopic) {
                    onUpdateTopic(selectedTrack.course.id, selectedTopic.topic.id, input);
                  }
                }}
                selectedTopic={selectedTopic}
                selectedTrack={selectedTrack}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function LevelTrackColumn({
  canManage,
  disabled,
  onCreateTopic,
  onDeleteCourse,
  onSelectTopic,
  selectedTopicId,
  track,
}: {
  canManage: boolean;
  disabled: boolean;
  onCreateTopic: (input: CurriculumTopicInput) => void;
  onDeleteCourse: () => void;
  onSelectTopic: (topicId: string) => void;
  selectedTopicId: string;
  track: CurriculumLevelTrack;
}) {
  const { t } = useAppTranslation();

  return (
    <article className="grid content-start gap-3 rounded-2xl border border-border bg-muted/45 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-2 py-1 text-xs font-extrabold text-primary">
              {track.levelLabel}
            </span>
            <span className="rounded-full bg-white px-2 py-1 text-xs font-extrabold text-muted-foreground">
              {track.course.isPublished ? t("courses.status.published") : t("courses.status.draft")}
            </span>
          </div>
          <h3 className="mt-2 truncate text-base font-extrabold">{track.course.title}</h3>
          <p className="mt-1 text-xs font-bold text-muted-foreground">
            {t("courses.summary.topicCount", { count: track.topics.length })} ·{" "}
            {t("courses.summary.lessonCount", { count: (track.course.lessonCount ?? 0) })}
          </p>
        </div>
        {canManage ? (
          <Button aria-label={t("courses.actions.deleteTrack")} disabled={disabled} onClick={onDeleteCourse} type="button" variant="outline">
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {track.course.description ? (
        <p className="text-sm leading-6 text-muted-foreground">{track.course.description}</p>
      ) : null}

      <div className="grid gap-2">
        {track.topics.length === 0 ? (
          <div className="rounded-xl border border-border bg-white p-3 text-sm font-semibold text-muted-foreground">
            {t("courses.empty.topics")}
          </div>
        ) : (
          track.topics.map((topic) => (
            <TopicBoardCard
              key={topic.topic.id}
              onSelect={() => onSelectTopic(topic.topic.id)}
              selected={selectedTopicId === topic.topic.id}
              topic={topic}
            />
          ))
        )}
      </div>

      {track.untitledLessons.length > 0 ? (
        <div className="rounded-xl border border-border bg-white/80 p-3">
          <div className="text-xs font-extrabold uppercase text-muted-foreground">{t("courses.empty.untitledLessons")}</div>
          <div className="mt-2 grid gap-1">
            {track.untitledLessons.slice(0, 3).map((lesson) => (
              <div className="truncate text-xs font-bold text-muted-foreground" key={lesson.id}>
                {lesson.orderIndex ?? "?"}. {lesson.title}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {canManage ? <TopicCreateForm disabled={disabled} onCreate={onCreateTopic} /> : null}
    </article>
  );
}

function TopicBoardCard({
  onSelect,
  selected,
  topic,
}: {
  onSelect: () => void;
  selected: boolean;
  topic: CurriculumTopicCard;
}) {
  const { t } = useAppTranslation();

  return (
    <button
      className="rounded-xl border border-border bg-white p-3 text-left transition hover:border-primary/40 data-[active=true]:border-primary data-[active=true]:shadow-sm"
      data-active={selected ? "true" : "false"}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-sm font-extrabold">{topic.topic.title}</span>
          {topic.topic.description ? (
            <span className="mt-1 line-clamp-2 block text-xs font-semibold leading-5 text-muted-foreground">
              {topic.topic.description}
            </span>
          ) : null}
        </span>
        <BookMarked className="h-4 w-4 shrink-0 text-primary" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-muted px-2 py-1 text-[0.68rem] font-black uppercase text-muted-foreground">
          {t("courses.summary.lessonCount", { count: topic.lessonCount })}
        </span>
        <span className="rounded-full bg-muted px-2 py-1 text-[0.68rem] font-black uppercase text-muted-foreground">
          {t("courses.summary.cardCount", { count: topic.cardCount })}
        </span>
      </div>
      {topic.previewLessons.length > 0 ? (
        <div className="mt-3 grid gap-1">
          {topic.previewLessons.map((lesson) => (
            <span className="truncate text-xs font-bold text-foreground" key={lesson.id}>
              {lesson.orderIndex ?? "?"}. {lesson.title}
            </span>
          ))}
          {topic.lessonCount > topic.previewLessons.length ? (
            <span className="text-xs font-bold text-muted-foreground">
              {t("courses.summary.previewMore", { count: topic.lessonCount - topic.previewLessons.length })}
            </span>
          ) : null}
        </div>
      ) : null}
    </button>
  );
}

function TopicInspector({
  activeMaterials,
  canManage,
  disabled,
  onCreateLesson,
  onDeleteLesson,
  onDeleteTopic,
  onReplaceLessonCards,
  onUpdateTopic,
  selectedTopic,
  selectedTrack,
}: {
  activeMaterials: LessonMaterial[];
  canManage: boolean;
  disabled: boolean;
  onCreateLesson: (input: CourseLessonInput) => void;
  onDeleteLesson: (lessonId: string) => void;
  onDeleteTopic: () => void;
  onReplaceLessonCards: (lessonId: string, input: LessonTemplateCardsInput) => void;
  onUpdateTopic: (input: CurriculumTopicInput) => void;
  selectedTopic: CurriculumTopicCard | null;
  selectedTrack: CurriculumLevelTrack | null;
}) {
  const { t } = useAppTranslation();

  if (!selectedTopic || !selectedTrack) {
    return (
      <aside className="rounded-2xl border border-border bg-muted/45 p-4 text-sm font-semibold text-muted-foreground">
        {t("courses.empty.selectTopic")}
      </aside>
    );
  }

  return (
    <aside className="grid content-start gap-4 rounded-2xl border border-border bg-white p-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-muted px-2 py-1 text-xs font-extrabold text-primary">
            {selectedTrack.levelLabel}
          </span>
          <span className="rounded-full bg-muted px-2 py-1 text-xs font-extrabold text-muted-foreground">
            {selectedTrack.course.title}
          </span>
        </div>
        <h3 className="mt-3 text-lg font-extrabold">{selectedTopic.topic.title}</h3>
        {selectedTopic.topic.description ? (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedTopic.topic.description}</p>
        ) : null}
        {selectedTopic.topic.tagSlugs.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {selectedTopic.topic.tagSlugs.map((tag) => (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-extrabold text-muted-foreground" key={tag}>
                <Tags className="h-3 w-3" />
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {canManage ? (
        <TopicSettingsForm
          disabled={disabled}
          onDelete={onDeleteTopic}
          onUpdate={onUpdateTopic}
          topic={selectedTopic.topic}
        />
      ) : null}

      <div className="grid gap-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-extrabold">{t("courses.inspector.lessons")}</h4>
        </div>

        {selectedTopic.lessons.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/50 p-3 text-sm font-semibold text-muted-foreground">
            {t("courses.empty.topicLessons")}
          </div>
        ) : (
          selectedTopic.lessons.map((lesson) => (
            <LessonComposition
              activeMaterials={activeMaterials}
              canManage={canManage}
              disabled={disabled}
              key={lesson.id}
              lesson={lesson}
              onDelete={() => onDeleteLesson(lesson.id)}
              onReplaceCards={(input) => onReplaceLessonCards(lesson.id, input)}
            />
          ))
        )}
      </div>

      {canManage ? (
        <CourseLessonCreateForm
          disabled={disabled}
          materials={activeMaterials}
          onCreate={onCreateLesson}
          topicId={selectedTopic.topic.id}
        />
      ) : null}
    </aside>
  );
}

function CourseCreateForm({
  disabled,
  onCreate,
}: {
  disabled: boolean;
  onCreate: (input: CourseInput) => void;
}) {
  const { t } = useAppTranslation();
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
        <FormField label={t("courses.form.courseTitle")}>
          <input
            className="playsay-input"
            disabled={disabled}
            maxLength={160}
            onChange={(event) => updateField("title", event.target.value)}
            placeholder={t("courses.form.courseTitlePlaceholder")}
            required
            value={form.title}
          />
        </FormField>
        <FormField label={t("courses.form.level")}>
          <input
            className="playsay-input"
            disabled={disabled}
            maxLength={16}
            onChange={(event) => updateField("level", event.target.value)}
            value={form.level}
          />
        </FormField>
        <FormField label={t("courses.form.language")}>
          <input
            className="playsay-input"
            disabled={disabled}
            maxLength={16}
            onChange={(event) => updateField("language", event.target.value)}
            value={form.language}
          />
        </FormField>
      </div>
      <FormField label={t("courses.form.description")}>
        <textarea
          className="playsay-input min-h-20 resize-none py-3"
          disabled={disabled}
          maxLength={2_000}
          onChange={(event) => updateField("description", event.target.value)}
          placeholder={t("courses.form.descriptionPlaceholder")}
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
          {t("courses.form.published")}
        </label>
        <Button disabled={disabled || form.title.trim().length === 0} type="submit">
          <Plus className="h-4 w-4" />
          {t("courses.form.createTrack")}
        </Button>
      </div>
    </form>
  );
}

function TopicCreateForm({
  disabled,
  onCreate,
}: {
  disabled: boolean;
  onCreate: (input: CurriculumTopicInput) => void;
}) {
  const { t } = useAppTranslation();
  const [form, setForm] = useState<TopicFormState>({
    title: "",
    description: "",
    orderIndex: "",
    tagSlugs: "",
  });

  function updateField(field: keyof TopicFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({
      title: form.title,
      description: form.description.trim() || null,
      orderIndex: parseOptionalNumber(form.orderIndex),
      tagSlugs: parseTagList(form.tagSlugs),
    });
    setForm({ title: "", description: "", orderIndex: "", tagSlugs: "" });
  }

  return (
    <form className="grid gap-2 rounded-xl border border-border bg-white p-3" onSubmit={submit}>
      <input
        className="playsay-input"
        disabled={disabled}
        maxLength={160}
        onChange={(event) => updateField("title", event.target.value)}
        placeholder={t("courses.form.topicTitlePlaceholder")}
        required
        value={form.title}
      />
      <div className="grid gap-2 sm:grid-cols-[5rem_1fr]">
        <input
          className="playsay-input"
          disabled={disabled}
          min={0}
          onChange={(event) => updateField("orderIndex", event.target.value)}
          placeholder={t("courses.form.orderPlaceholder")}
          type="number"
          value={form.orderIndex}
        />
        <input
          className="playsay-input"
          disabled={disabled}
          maxLength={240}
          onChange={(event) => updateField("tagSlugs", event.target.value)}
          placeholder={t("courses.form.topicTagsPlaceholder")}
          value={form.tagSlugs}
        />
      </div>
      <Button disabled={disabled || form.title.trim().length === 0} type="submit">
        <Plus className="h-4 w-4" />
        {t("courses.form.createTopic")}
      </Button>
    </form>
  );
}

function TopicSettingsForm({
  disabled,
  onDelete,
  onUpdate,
  topic,
}: {
  disabled: boolean;
  onDelete: () => void;
  onUpdate: (input: CurriculumTopicInput) => void;
  topic: CurriculumTopic;
}) {
  const { t } = useAppTranslation();
  const [form, setForm] = useState<TopicFormState>(() => topicToForm(topic));

  useEffect(() => {
    setForm(topicToForm(topic));
  }, [topic]);

  function updateField(field: keyof TopicFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onUpdate({
      title: form.title,
      description: form.description.trim() || null,
      orderIndex: parseOptionalNumber(form.orderIndex),
      tagSlugs: parseTagList(form.tagSlugs),
    });
  }

  return (
    <form className="grid gap-3 rounded-xl border border-border bg-muted/45 p-3" onSubmit={submit}>
      <div className="flex items-center gap-2 text-xs font-extrabold uppercase text-muted-foreground">
        <Tags className="h-3.5 w-3.5" />
        {t("courses.inspector.topicSettings")}
      </div>
      <FormField label={t("courses.form.topicTitle")}>
        <input
          className="playsay-input"
          disabled={disabled}
          maxLength={160}
          onChange={(event) => updateField("title", event.target.value)}
          required
          value={form.title}
        />
      </FormField>
      <div className="grid gap-2 sm:grid-cols-[5rem_1fr]">
        <FormField label={t("courses.form.order")}>
          <input
            className="playsay-input"
            disabled={disabled}
            min={0}
            onChange={(event) => updateField("orderIndex", event.target.value)}
            type="number"
            value={form.orderIndex}
          />
        </FormField>
        <FormField label={t("courses.form.topicTags")}>
          <input
            className="playsay-input"
            disabled={disabled}
            maxLength={240}
            onChange={(event) => updateField("tagSlugs", event.target.value)}
            value={form.tagSlugs}
          />
        </FormField>
      </div>
      <FormField label={t("courses.form.topicDescription")}>
        <textarea
          className="playsay-input min-h-20 resize-none py-3"
          disabled={disabled}
          maxLength={2_000}
          onChange={(event) => updateField("description", event.target.value)}
          value={form.description}
        />
      </FormField>
      <div className="flex flex-wrap justify-end gap-2">
        <Button disabled={disabled} onClick={onDelete} type="button" variant="outline">
          <Trash2 className="h-4 w-4" />
          {t("courses.actions.deleteTopic")}
        </Button>
        <Button disabled={disabled || form.title.trim().length === 0} type="submit">
          <Save className="h-4 w-4" />
          {t("common.actions.save")}
        </Button>
      </div>
    </form>
  );
}

function CourseLessonCreateForm({
  disabled,
  materials,
  onCreate,
  topicId,
}: {
  disabled: boolean;
  materials: LessonMaterial[];
  onCreate: (input: CourseLessonInput) => void;
  topicId: string;
}) {
  const { t } = useAppTranslation();
  const [form, setForm] = useState<LessonFormState>({
    title: "",
    orderIndex: "",
    plannedDurationMin: "45",
    materialId: "",
  });

  function updateField(field: keyof LessonFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const plannedDurationMin = parseOptionalNumber(form.plannedDurationMin);
    const cards: LessonTemplateCardInput[] = form.materialId
      ? [{
        materialId: form.materialId,
        orderIndex: 1,
        role: "MAIN",
        plannedDurationMin,
      }]
      : [];
    onCreate({
      title: form.title,
      orderIndex: parseOptionalNumber(form.orderIndex),
      plannedDurationMin,
      topicId,
      materialId: form.materialId || null,
      cards,
    });
    setForm((current) => ({ ...current, title: "", orderIndex: "", materialId: "" }));
  }

  return (
    <form className="grid gap-2 rounded-xl border border-border bg-muted/45 p-3" onSubmit={submit}>
      <div className="text-xs font-extrabold uppercase text-muted-foreground">{t("courses.form.createLesson")}</div>
      <input
        className="playsay-input"
        disabled={disabled}
        maxLength={160}
        onChange={(event) => updateField("title", event.target.value)}
        placeholder={t("courses.form.lessonTitlePlaceholder")}
        required
        value={form.title}
      />
      <div className="grid gap-2 sm:grid-cols-[5rem_6rem_1fr]">
        <input
          className="playsay-input"
          disabled={disabled}
          min={0}
          onChange={(event) => updateField("orderIndex", event.target.value)}
          placeholder={t("courses.form.orderPlaceholder")}
          type="number"
          value={form.orderIndex}
        />
        <input
          className="playsay-input"
          disabled={disabled}
          max={480}
          min={1}
          onChange={(event) => updateField("plannedDurationMin", event.target.value)}
          placeholder={t("courses.form.durationPlaceholder")}
          type="number"
          value={form.plannedDurationMin}
        />
        <select
          className="playsay-input"
          disabled={disabled || materials.length === 0}
          onChange={(event) => updateField("materialId", event.target.value)}
          value={form.materialId}
        >
          <option value="">{t("courses.form.noInitialCard")}</option>
          {materials.map((material) => (
            <option key={material.id} value={material.id}>
              {material.title}
            </option>
          ))}
        </select>
      </div>
      <Button disabled={disabled || form.title.trim().length === 0} type="submit">
        <Plus className="h-4 w-4" />
        {t("courses.form.addLesson")}
      </Button>
    </form>
  );
}

function LessonComposition({
  activeMaterials,
  canManage,
  disabled,
  lesson,
  onDelete,
  onReplaceCards,
}: {
  activeMaterials: LessonMaterial[];
  canManage: boolean;
  disabled: boolean;
  lesson: CourseLesson;
  onDelete: () => void;
  onReplaceCards: (input: LessonTemplateCardsInput) => void;
}) {
  const { t } = useAppTranslation();
  const translate = (key: string, options?: Record<string, unknown>) => t(key, options);
  const sortedCards = [...(lesson.cards ?? [])].sort((left, right) => (left.orderIndex ?? 0) - (right.orderIndex ?? 0));

  function replaceCards(cards: LessonTemplateCardInput[]) {
    onReplaceCards({ cards: normalizeCardOrder(cards) });
  }

  return (
    <article className="rounded-xl border border-border bg-muted/35 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold">{lesson.title}</div>
          <div className="mt-1 text-xs font-bold text-muted-foreground">
            {t("courses.summary.lessonOrder", { order: lesson.orderIndex ?? "?" })} ·{" "}
            {formatDuration(lesson.plannedDurationMin, translate)}
          </div>
        </div>
        {canManage ? (
          <Button disabled={disabled} onClick={onDelete} type="button" variant="outline">
            <Trash2 className="h-4 w-4" />
            {t("courses.actions.deleteLesson")}
          </Button>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2">
        {sortedCards.length === 0 ? (
          <div className="rounded-lg border border-border bg-white p-3 text-sm font-semibold text-muted-foreground">
            {t("courses.empty.cards")}
          </div>
        ) : (
          sortedCards.map((card, index) => (
            <div className="grid gap-2 rounded-lg border border-border bg-white p-2" key={card.id}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-extrabold">{card.materialTitle}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs font-bold text-muted-foreground">
                    <span>{t(`courses.roles.${card.role.toLowerCase()}`, { defaultValue: card.role })}</span>
                    <span>{formatDuration(card.plannedDurationMin, translate)}</span>
                  </div>
                </div>
                {canManage ? (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      aria-label={t("courses.actions.moveCardUp")}
                      disabled={disabled || index === 0}
                      onClick={() => replaceCards(moveCard(sortedCards, index, index - 1))}
                      type="button"
                      variant="outline"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      aria-label={t("courses.actions.moveCardDown")}
                      disabled={disabled || index === sortedCards.length - 1}
                      onClick={() => replaceCards(moveCard(sortedCards, index, index + 1))}
                      type="button"
                      variant="outline"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      aria-label={t("courses.actions.removeCard")}
                      disabled={disabled}
                      onClick={() => replaceCards(sortedCards.filter((_, cardIndex) => cardIndex !== index))}
                      type="button"
                      variant="outline"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      {canManage ? (
        <LessonCardAddForm
          disabled={disabled}
          materials={activeMaterials}
          onAdd={(card) => replaceCards([...sortedCards, card])}
        />
      ) : null}
    </article>
  );
}

function LessonCardAddForm({
  disabled,
  materials,
  onAdd,
}: {
  disabled: boolean;
  materials: LessonMaterial[];
  onAdd: (card: LessonTemplateCardInput) => void;
}) {
  const { t } = useAppTranslation();
  const [form, setForm] = useState<LessonCardFormState>({
    materialId: "",
    role: "MAIN",
    plannedDurationMin: "",
  });

  function updateField(field: keyof LessonCardFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.materialId) {
      return;
    }
    onAdd({
      materialId: form.materialId,
      role: form.role,
      plannedDurationMin: parseOptionalNumber(form.plannedDurationMin),
    });
    setForm((current) => ({ ...current, materialId: "", plannedDurationMin: "" }));
  }

  return (
    <form className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_5rem_auto]" onSubmit={submit}>
      <select
        className="playsay-input"
        disabled={disabled || materials.length === 0}
        onChange={(event) => updateField("materialId", event.target.value)}
        value={form.materialId}
      >
        <option value="">{materials.length === 0 ? t("courses.empty.noMaterials") : t("courses.form.cardSelect")}</option>
        {materials.map((material) => (
          <option key={material.id} value={material.id}>
            {material.title}
          </option>
        ))}
      </select>
      <select
        className="playsay-input"
        disabled={disabled}
        onChange={(event) => updateField("role", event.target.value)}
        value={form.role}
      >
        {["MAIN", "PRACTICE", "SPEAKING", "HOMEWORK"].map((role) => (
          <option key={role} value={role}>
            {t(`courses.roles.${role.toLowerCase()}`)}
          </option>
        ))}
      </select>
      <input
        className="playsay-input"
        disabled={disabled}
        max={480}
        min={1}
        onChange={(event) => updateField("plannedDurationMin", event.target.value)}
        placeholder={t("courses.form.durationPlaceholder")}
        type="number"
        value={form.plannedDurationMin}
      />
      <Button disabled={disabled || !form.materialId} type="submit">
        <Plus className="h-4 w-4" />
        {t("courses.form.addCard")}
      </Button>
    </form>
  );
}

function findTopicCard(board: CurriculumLevelTrack[], topicId: string): CurriculumTopicCard | null {
  if (!topicId) {
    return null;
  }
  return board.flatMap((track) => track.topics).find((topic) => topic.topic.id === topicId) ?? null;
}

function topicToForm(topic: CurriculumTopic): TopicFormState {
  return {
    title: topic.title,
    description: topic.description ?? "",
    orderIndex: topic.orderIndex?.toString() ?? "",
    tagSlugs: topic.tagSlugs.join(", "),
  };
}

function parseTagList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeCardOrder(cards: LessonTemplateCardInput[]): LessonTemplateCardInput[] {
  return cards.map((card, index) => ({
    materialId: card.materialId,
    orderIndex: index + 1,
    role: card.role,
    plannedDurationMin: card.plannedDurationMin ?? null,
  }));
}

function moveCard(cards: LessonTemplateCardInput[], fromIndex: number, toIndex: number): LessonTemplateCardInput[] {
  const next = [...cards];
  const [card] = next.splice(fromIndex, 1);
  if (!card) {
    return cards;
  }
  next.splice(toIndex, 0, card);
  return next;
}
