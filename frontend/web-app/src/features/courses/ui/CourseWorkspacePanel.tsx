import { useEffect, useMemo, useRef, useState, type FormEvent, type Ref } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookMarked,
  ChevronDown,
  Layers3,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Tags,
  Trash2,
  X,
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
  onCreateTopic: (courseId: string, input: CurriculumTopicInput) => Promise<CurriculumTopic | null>;
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
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [courseCreateOpen, setCourseCreateOpen] = useState(false);
  const [creatingTopicCourseId, setCreatingTopicCourseId] = useState("");
  const topicButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const inspectorRef = useRef<HTMLElement>(null);
  const selectedTopic = findTopicCard(board, selectedTopicId);
  const selectedTrack = selectedTopic ? board.find((track) => track.course.id === selectedTopic.topic.courseId) ?? null : null;
  const activeMaterials = useMemo(
    () => materials.filter((material) => material.status !== "ARCHIVED"),
    [materials],
  );

  useEffect(() => {
    if (selectedTopicId && !selectedTopic) {
      setSelectedTopicId("");
    }
  }, [selectedTopic, selectedTopicId]);

  useEffect(() => {
    if (!selectedTopicId || typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    if (window.matchMedia("(max-width: 1279px)").matches) {
      inspectorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedTopicId]);

  function closeInspector() {
    const topicId = selectedTopicId;
    setSelectedTopicId("");
    queueMicrotask(() => topicButtonRefs.current.get(topicId)?.focus());
  }

  return (
    <section className="min-w-0 max-w-full rounded-[1.25rem] border border-border bg-white/80 p-4" data-testid="curriculum-program">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <Layers3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-extrabold">{t("courses.title")}</h2>
        </div>
        <div className="flex max-w-full flex-wrap justify-end gap-2">
          {canManage ? (
            <Button
              aria-controls="curriculum-course-create-form"
              aria-expanded={courseCreateOpen}
              disabled={disabled}
              onClick={() => setCourseCreateOpen((open) => !open)}
              type="button"
              variant={courseCreateOpen ? "outline" : "default"}
            >
              {courseCreateOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {courseCreateOpen ? t("common.actions.cancel") : t("courses.actions.newTrack")}
            </Button>
          ) : null}
          <Button disabled={disabled} onClick={onRefresh} type="button" variant="outline">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t("common.actions.refresh")}
          </Button>
        </div>
      </div>

      {!profile ? (
        <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
          {t("courses.loginRequired")}
        </div>
      ) : (
        <div className="mt-4 grid min-w-0 max-w-full gap-4">
          {canManage && courseCreateOpen ? (
            <div id="curriculum-course-create-form">
              <CourseCreateForm
                disabled={disabled}
                onCreate={(input) => {
                  onCreateCourse(input);
                  setCourseCreateOpen(false);
                }}
              />
            </div>
          ) : null}

          {message ? (
            <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
              {message}
            </div>
          ) : null}

          <div className="flex min-w-0 items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm font-semibold leading-5 text-muted-foreground">
            <BookMarked className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="min-w-0 break-words [overflow-wrap:anywhere]">
              {canManage ? t("courses.guide.manager") : t("courses.guide.student")}
            </p>
          </div>

          {courses.length === 0 ? (
            <div className="rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
              {canManage ? t("courses.empty.manager") : t("courses.empty.student")}
            </div>
          ) : (
            <div
              className={`grid min-w-0 max-w-full gap-4 xl:items-start ${
                selectedTopic ? "xl:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)]" : ""
              }`}
              data-inspector-open={selectedTopic ? "true" : "false"}
              data-testid="curriculum-board"
            >
              <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain pb-2" data-testid="curriculum-levels-scroller">
                <div className="grid min-w-full max-w-full auto-cols-[minmax(16rem,1fr)] grid-flow-col gap-3 sm:auto-cols-[minmax(18rem,1fr)]" data-testid="curriculum-levels">
                  {board.map((track) => (
                    <LevelTrackColumn
                      canManage={canManage}
                      disabled={disabled}
                      key={track.course.id}
                      onCreateTopic={(input) => onCreateTopic(track.course.id, input)}
                      onTopicCreated={(createdTopic) => {
                        setCreatingTopicCourseId("");
                        setSelectedTopicId(createdTopic.id);
                      }}
                      onDeleteCourse={() => onDeleteCourse(track.course.id)}
                      onSelectTopic={setSelectedTopicId}
                      onTopicButtonRef={(topicId, button) => {
                        if (button) {
                          topicButtonRefs.current.set(topicId, button);
                        } else {
                          topicButtonRefs.current.delete(topicId);
                        }
                      }}
                      onToggleTopicCreate={() => {
                        setCreatingTopicCourseId((courseId) => courseId === track.course.id ? "" : track.course.id);
                      }}
                      selectedTopicId={selectedTopicId}
                      topicCreateOpen={creatingTopicCourseId === track.course.id}
                      track={track}
                    />
                  ))}
                </div>
              </div>

              {selectedTopic && selectedTrack ? (
                <TopicInspector
                  activeMaterials={activeMaterials}
                  canManage={canManage}
                  disabled={disabled}
                  inspectorRef={inspectorRef}
                  key={selectedTopic.topic.id}
                  onClose={closeInspector}
                  onCreateLesson={(input) => onCreateLesson(selectedTrack.course.id, input)}
                  onDeleteLesson={(lessonId) => onDeleteLesson(selectedTrack.course.id, lessonId)}
                  onDeleteTopic={() => {
                    onDeleteTopic(selectedTrack.course.id, selectedTopic.topic.id);
                    closeInspector();
                  }}
                  onReplaceLessonCards={(lessonId, input) => onReplaceLessonCards(selectedTrack.course.id, lessonId, input)}
                  onUpdateTopic={(input) => onUpdateTopic(selectedTrack.course.id, selectedTopic.topic.id, input)}
                  selectedTopic={selectedTopic}
                  selectedTrack={selectedTrack}
                />
              ) : null}
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
  onToggleTopicCreate,
  onTopicCreated,
  onTopicButtonRef,
  selectedTopicId,
  topicCreateOpen,
  track,
}: {
  canManage: boolean;
  disabled: boolean;
  onCreateTopic: (input: CurriculumTopicInput) => Promise<CurriculumTopic | null>;
  onDeleteCourse: () => void;
  onSelectTopic: (topicId: string) => void;
  onToggleTopicCreate: () => void;
  onTopicCreated: (topic: CurriculumTopic) => void;
  onTopicButtonRef: (topicId: string, button: HTMLButtonElement | null) => void;
  selectedTopicId: string;
  topicCreateOpen: boolean;
  track: CurriculumLevelTrack;
}) {
  const { t } = useAppTranslation();

  return (
    <article className="grid min-w-0 max-w-full content-start gap-3 rounded-2xl border border-border bg-muted/45 p-3" data-testid="curriculum-level-track">
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
          <h3 className="mt-2 break-words text-base font-extrabold [overflow-wrap:anywhere]">{track.course.title}</h3>
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
        <p className="break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
          {track.course.description}
        </p>
      ) : null}

      <div className="grid gap-2">
        {track.topics.length === 0 ? (
          <div className="rounded-xl border border-border bg-white p-3 text-sm font-semibold text-muted-foreground">
            {t("courses.empty.topics")}
          </div>
        ) : (
          track.topics.map((topic) => (
            <TopicBoardCard
              buttonRef={(button) => onTopicButtonRef(topic.topic.id, button)}
              key={topic.topic.id}
              onSelect={() => onSelectTopic(topic.topic.id)}
              selected={selectedTopicId === topic.topic.id}
              topic={topic}
            />
          ))
        )}
      </div>

      {track.untitledLessons.length > 0 ? (
        <details className="group min-w-0 rounded-xl border border-border bg-white/80 p-3">
          <summary className="flex min-w-0 cursor-pointer list-none items-center justify-between gap-2 text-xs font-extrabold uppercase text-muted-foreground">
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">
              {t("courses.empty.untitledLessons")} · {track.untitledLessons.length}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 grid gap-1">
            {track.untitledLessons.map((lesson) => (
              <div className="break-words text-xs font-bold text-muted-foreground [overflow-wrap:anywhere]" key={lesson.id}>
                {lesson.orderIndex ?? "?"}. {lesson.title}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {canManage ? (
        <div className="grid min-w-0 gap-2">
          <Button
            aria-controls={`curriculum-topic-create-${track.course.id}`}
            aria-expanded={topicCreateOpen}
            className="h-auto min-h-10 max-w-full whitespace-normal text-center"
            disabled={disabled}
            onClick={onToggleTopicCreate}
            type="button"
            variant={topicCreateOpen ? "outline" : "default"}
          >
            {topicCreateOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {topicCreateOpen ? t("common.actions.cancel") : t("courses.form.createTopic")}
          </Button>
          {topicCreateOpen ? (
            <div id={`curriculum-topic-create-${track.course.id}`}>
              <TopicCreateForm disabled={disabled} onCreate={onCreateTopic} onCreated={onTopicCreated} />
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function TopicBoardCard({
  buttonRef,
  onSelect,
  selected,
  topic,
}: {
  buttonRef: (button: HTMLButtonElement | null) => void;
  onSelect: () => void;
  selected: boolean;
  topic: CurriculumTopicCard;
}) {
  const { t } = useAppTranslation();

  return (
    <button
      aria-controls="curriculum-topic-inspector"
      aria-label={t("courses.actions.openTopic", { title: topic.topic.title })}
      aria-pressed={selected}
      className="min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-white p-3 text-left transition hover:border-primary/40 data-[active=true]:border-primary data-[active=true]:shadow-sm"
      data-active={selected ? "true" : "false"}
      onClick={onSelect}
      ref={buttonRef}
      type="button"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block break-words text-sm font-extrabold [overflow-wrap:anywhere]">{topic.topic.title}</span>
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
            <span className="break-words text-xs font-bold text-foreground [overflow-wrap:anywhere]" key={lesson.id}>
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
  inspectorRef,
  onClose,
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
  inspectorRef: Ref<HTMLElement>;
  onClose: () => void;
  onCreateLesson: (input: CourseLessonInput) => void;
  onDeleteLesson: (lessonId: string) => void;
  onDeleteTopic: () => void;
  onReplaceLessonCards: (lessonId: string, input: LessonTemplateCardsInput) => void;
  onUpdateTopic: (input: CurriculumTopicInput) => void;
  selectedTopic: CurriculumTopicCard;
  selectedTrack: CurriculumLevelTrack;
}) {
  const { t } = useAppTranslation();
  const [lessonCreateOpen, setLessonCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const lessonCreateId = `curriculum-lesson-create-${selectedTopic.topic.id}`;
  const settingsId = `curriculum-topic-settings-${selectedTopic.topic.id}`;

  return (
    <aside
      className="grid min-w-0 max-w-full scroll-mt-4 content-start gap-4 overflow-hidden rounded-2xl border border-border bg-white p-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto"
      data-testid="curriculum-topic-inspector"
      id="curriculum-topic-inspector"
      ref={inspectorRef}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
            {t("courses.inspector.title")}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-extrabold text-primary">
              {selectedTrack.levelLabel}
            </span>
            <span className="max-w-full break-words rounded-full bg-muted px-2 py-1 text-xs font-extrabold text-muted-foreground [overflow-wrap:anywhere]">
              {selectedTrack.course.title}
            </span>
          </div>
          <h3 className="mt-3 break-words text-lg font-extrabold [overflow-wrap:anywhere]">
            {selectedTopic.topic.title}
          </h3>
          {selectedTopic.topic.description ? (
            <p className="mt-2 break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
              {selectedTopic.topic.description}
            </p>
          ) : null}
          {selectedTopic.topic.tagSlugs.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {selectedTopic.topic.tagSlugs.map((tag) => (
                <span className="inline-flex max-w-full items-center gap-1 break-all rounded-full bg-muted px-2 py-1 text-xs font-extrabold text-muted-foreground" key={tag}>
                  <Tags className="h-3 w-3 shrink-0" />
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <Button
          aria-label={t("courses.actions.closeInspector")}
          className="h-10 shrink-0 px-3"
          onClick={onClose}
          type="button"
          variant="outline"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid min-w-0 max-w-full gap-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <ListChecks className="h-4 w-4 shrink-0 text-primary" />
            <h4 className="break-words text-sm font-extrabold [overflow-wrap:anywhere]">{t("courses.inspector.lessons")}</h4>
          </div>
          {canManage ? (
            <Button
              aria-controls={lessonCreateId}
              aria-expanded={lessonCreateOpen}
              className="h-auto min-h-10 max-w-full whitespace-normal text-center"
              disabled={disabled}
              onClick={() => setLessonCreateOpen((open) => !open)}
              type="button"
              variant={lessonCreateOpen ? "outline" : "default"}
            >
              {lessonCreateOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {lessonCreateOpen ? t("common.actions.cancel") : t("courses.form.createLesson")}
            </Button>
          ) : null}
        </div>

        {canManage && lessonCreateOpen ? (
          <div id={lessonCreateId}>
            <CourseLessonCreateForm
              disabled={disabled}
              materials={activeMaterials}
              onCreate={(input) => {
                onCreateLesson(input);
                setLessonCreateOpen(false);
              }}
              topicId={selectedTopic.topic.id}
            />
          </div>
        ) : null}

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
        <div className="grid min-w-0 gap-2 border-t border-border pt-3">
          <Button
            aria-controls={settingsId}
            aria-expanded={settingsOpen}
            className="h-auto min-h-10 max-w-full whitespace-normal text-center"
            disabled={disabled}
            onClick={() => setSettingsOpen((open) => !open)}
            type="button"
            variant="outline"
          >
            <Settings2 className="h-4 w-4" />
            {t("courses.inspector.topicSettings")}
          </Button>
          {settingsOpen ? (
            <div id={settingsId}>
              <TopicSettingsForm
                disabled={disabled}
                onDelete={onDeleteTopic}
                onUpdate={onUpdateTopic}
                topic={selectedTopic.topic}
              />
            </div>
          ) : null}
        </div>
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
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_7rem]">
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
  onCreated,
}: {
  disabled: boolean;
  onCreate: (input: CurriculumTopicInput) => Promise<CurriculumTopic | null>;
  onCreated: (topic: CurriculumTopic) => void;
}) {
  const { t } = useAppTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<TopicFormState>({
    title: "",
    description: "",
    orderIndex: "",
    tagSlugs: "",
  });

  function updateField(field: keyof TopicFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    let createdTopic: CurriculumTopic | null = null;
    try {
      createdTopic = await onCreate({
        title: form.title,
        description: form.description.trim() || null,
        orderIndex: parseOptionalNumber(form.orderIndex),
        tagSlugs: parseTagList(form.tagSlugs),
      });
      if (createdTopic) {
        setForm({ title: "", description: "", orderIndex: "", tagSlugs: "" });
      }
    } finally {
      setSubmitting(false);
    }
    if (createdTopic) {
      onCreated(createdTopic);
    }
  }

  return (
    <form className="grid gap-2 rounded-xl border border-border bg-white p-3" onSubmit={(event) => void submit(event)}>
      <input
        className="playsay-input"
        disabled={disabled || submitting}
        maxLength={160}
        onChange={(event) => updateField("title", event.target.value)}
        placeholder={t("courses.form.topicTitlePlaceholder")}
        required
        value={form.title}
      />
      <div className="grid min-w-0 gap-2 sm:grid-cols-[5rem_minmax(0,1fr)]">
        <input
          className="playsay-input"
          disabled={disabled || submitting}
          min={0}
          onChange={(event) => updateField("orderIndex", event.target.value)}
          placeholder={t("courses.form.orderPlaceholder")}
          type="number"
          value={form.orderIndex}
        />
        <input
          className="playsay-input"
          disabled={disabled || submitting}
          maxLength={240}
          onChange={(event) => updateField("tagSlugs", event.target.value)}
          placeholder={t("courses.form.topicTagsPlaceholder")}
          value={form.tagSlugs}
        />
      </div>
      <Button disabled={disabled || submitting || form.title.trim().length === 0} type="submit">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
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
      <div className="grid min-w-0 gap-2 sm:grid-cols-[5rem_minmax(0,1fr)]">
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
        <Button className="h-auto min-h-10 max-w-full whitespace-normal text-center" disabled={disabled} onClick={onDelete} type="button" variant="outline">
          <Trash2 className="h-4 w-4" />
          {t("courses.actions.deleteTopic")}
        </Button>
        <Button className="h-auto min-h-10 max-w-full whitespace-normal text-center" disabled={disabled || form.title.trim().length === 0} type="submit">
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
    <form className="grid gap-2 rounded-xl border border-border bg-muted/45 p-3" data-testid="curriculum-lesson-create-form" onSubmit={submit}>
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
      <div className="flex min-w-0 max-w-full flex-wrap gap-2">
        <input
          className="playsay-input min-w-0 flex-[1_1_5rem]"
          disabled={disabled}
          min={0}
          onChange={(event) => updateField("orderIndex", event.target.value)}
          placeholder={t("courses.form.orderPlaceholder")}
          type="number"
          value={form.orderIndex}
        />
        <input
          className="playsay-input min-w-0 flex-[1_1_6rem]"
          disabled={disabled}
          max={480}
          min={1}
          onChange={(event) => updateField("plannedDurationMin", event.target.value)}
          placeholder={t("courses.form.durationPlaceholder")}
          type="number"
          value={form.plannedDurationMin}
        />
        <select
          className="playsay-input min-w-0 max-w-full flex-[3_1_12rem]"
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
      <Button className="h-auto min-h-10 max-w-full whitespace-normal text-center" disabled={disabled || form.title.trim().length === 0} type="submit">
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
  const [cardCreateOpen, setCardCreateOpen] = useState(false);
  const translate = (key: string, options?: Record<string, unknown>) => t(key, options);
  const sortedCards = [...(lesson.cards ?? [])].sort((left, right) => (left.orderIndex ?? 0) - (right.orderIndex ?? 0));
  const cardCreateId = `curriculum-card-add-${lesson.id}`;

  function replaceCards(cards: LessonTemplateCardInput[]) {
    onReplaceCards({ cards: normalizeCardOrder(cards) });
  }

  return (
    <article className="min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-muted/35 p-3" data-testid="curriculum-lesson-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words text-sm font-extrabold [overflow-wrap:anywhere]">{lesson.title}</div>
          <div className="mt-1 text-xs font-bold text-muted-foreground">
            {t("courses.summary.lessonOrder", { order: lesson.orderIndex ?? "?" })} ·{" "}
            {formatDuration(lesson.plannedDurationMin, translate)}
          </div>
        </div>
        {canManage ? (
          <Button className="h-auto min-h-10 max-w-full whitespace-normal text-center" disabled={disabled} onClick={onDelete} type="button" variant="outline">
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
            <div className="grid min-w-0 max-w-full gap-2 overflow-hidden rounded-lg border border-border bg-white p-2" key={card.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="break-words text-sm font-extrabold [overflow-wrap:anywhere]">{card.materialTitle}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs font-bold text-muted-foreground">
                    <span>{t(`courses.roles.${card.role.toLowerCase()}`, { defaultValue: card.role })}</span>
                    <span>{formatDuration(card.plannedDurationMin, translate)}</span>
                  </div>
                </div>
                {canManage ? (
                  <div className="flex max-w-full flex-wrap gap-1">
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
        <div className="mt-3 grid min-w-0 gap-2">
          <Button
            aria-controls={cardCreateId}
            aria-expanded={cardCreateOpen}
            className="h-auto min-h-10 max-w-full whitespace-normal text-center"
            disabled={disabled}
            onClick={() => setCardCreateOpen((open) => !open)}
            type="button"
            variant="outline"
          >
            {cardCreateOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {cardCreateOpen ? t("common.actions.cancel") : t("courses.actions.addCard")}
          </Button>
          {cardCreateOpen ? (
            <div id={cardCreateId}>
              <LessonCardAddForm
                disabled={disabled}
                materials={activeMaterials}
                onAdd={(card) => {
                  replaceCards([...sortedCards, card]);
                  setCardCreateOpen(false);
                }}
              />
            </div>
          ) : null}
        </div>
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
    <form className="mt-2 flex min-w-0 max-w-full flex-wrap gap-2" data-testid="curriculum-card-add-form" onSubmit={submit}>
      <select
        className="playsay-input min-w-0 max-w-full flex-[3_1_12rem]"
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
        className="playsay-input min-w-[8rem] max-w-full flex-[1_1_8rem]"
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
        className="playsay-input min-w-[5rem] max-w-full flex-[1_1_5rem]"
        disabled={disabled}
        max={480}
        min={1}
        onChange={(event) => updateField("plannedDurationMin", event.target.value)}
        placeholder={t("courses.form.durationPlaceholder")}
        type="number"
        value={form.plannedDurationMin}
      />
      <Button className="h-auto min-h-10 max-w-full shrink-0 whitespace-normal text-center" disabled={disabled || !form.materialId} type="submit">
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
