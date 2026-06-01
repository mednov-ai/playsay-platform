import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, CheckCircle2, ClipboardList, Loader2, RefreshCw, Send } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  createHomeworkAssignment,
  createHomeworkFromScheduledLesson,
  fetchHomeworkAssignment,
  fetchHomeworkAssignments,
  fetchMyHomeworkAssignment,
  fetchMyHomeworkAssignments,
  saveMyHomeworkAssignmentSubmission,
  type AdminUserProfile,
  type HomeworkAssignment,
  type HomeworkAssignmentDetail,
  type HomeworkRecipientProgress,
  type LessonMaterial,
  type LessonMaterialJson,
  type MeProfile,
  type ScheduledLesson,
  type StudentHomeworkDetail,
} from "../../../shared/api/playsay";
import {
  formatMaterialScore,
  formatSubmissionTime,
  LessonMaterialDocumentView,
  materialAnswersFromSubmission,
  materialLiveScore,
  type MaterialAnswerBlock,
  type MaterialAnswerState,
} from "../../materials";
import { useAppTranslation } from "../../../shared/i18n";
import { FormField } from "../../../shared/ui/FormField";

type HomeworkProgressFilter = "all" | "missing" | "errors";

export function HomeworkPanel({
  disabled,
  materials,
  profile,
  scheduledLessons,
  studentUsers,
}: {
  disabled: boolean;
  materials: LessonMaterial[];
  profile: MeProfile | null;
  scheduledLessons: ScheduledLesson[];
  studentUsers: AdminUserProfile[];
}) {
  const { t } = useAppTranslation();
  const canManage = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
  const [assignments, setAssignments] = useState<HomeworkAssignment[]>([]);
  const [detail, setDetail] = useState<HomeworkAssignmentDetail | null>(null);
  const [studentDetail, setStudentDetail] = useState<StudentHomeworkDetail | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [title, setTitle] = useState("");
  const [answers, setAnswers] = useState<MaterialAnswerState>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const assignableMaterials = materials.filter((material) => material.status !== "ARCHIVED");
  const lessonHomeworkOptions = scheduledLessons.filter((lesson) => Boolean(lesson.materialId));
  const selectedAssignment = assignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null;
  const filteredStudentUsers = useMemo(() => {
    const query = studentSearch.trim().toLocaleLowerCase();
    if (!query) {
      return studentUsers;
    }
    return studentUsers.filter((student) => studentSearchText(student).includes(query));
  }, [studentSearch, studentUsers]);

  useEffect(() => {
    if (!profile) {
      setAssignments([]);
      setDetail(null);
      setStudentDetail(null);
      setSelectedAssignmentId(null);
      return undefined;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const items = canManage ? await fetchHomeworkAssignments() : await fetchMyHomeworkAssignments();
        if (!cancelled) {
          setAssignments(items);
          setSelectedAssignmentId((current) => current ?? items[0]?.id ?? null);
          setLastLoadedAt(new Date().toISOString());
          setMessage(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setAssignments([]);
          setMessage(caught instanceof Error ? caught.message : t("homework.messages.loadFailed"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [canManage, profile?.subject]);

  useEffect(() => {
    if (!selectedAssignmentId) {
      setDetail(null);
      setStudentDetail(null);
      return undefined;
    }

    let cancelled = false;
    const assignmentId = selectedAssignmentId;

    async function loadDetail() {
      setLoading(true);
      try {
        if (canManage) {
          const loaded = await fetchHomeworkAssignment(assignmentId);
          if (!cancelled) {
            setDetail(loaded);
            setStudentDetail(null);
            setLastLoadedAt(new Date().toISOString());
          }
        } else {
          const loaded = await fetchMyHomeworkAssignment(assignmentId);
          if (!cancelled) {
            setStudentDetail(loaded);
            setDetail(null);
            setAnswers(materialAnswersFromSubmission(loaded.submission));
            setLastLoadedAt(new Date().toISOString());
          }
        }
        if (!cancelled) {
          setMessage(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setDetail(null);
          setStudentDetail(null);
          setMessage(caught instanceof Error ? caught.message : t("homework.messages.detailLoadFailed"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [canManage, selectedAssignmentId]);

  useEffect(() => {
    if (!canManage || !profile || !selectedAssignmentId) {
      return undefined;
    }

    let cancelled = false;
    const assignmentId = selectedAssignmentId;
    const intervalId = window.setInterval(() => {
      Promise.all([fetchHomeworkAssignments(), fetchHomeworkAssignment(assignmentId)])
        .then(([items, loaded]) => {
          if (!cancelled) {
            setAssignments(items);
            setDetail(loaded);
            setLastLoadedAt(new Date().toISOString());
          }
        })
        .catch(() => {
          // Keep the last visible snapshot; the manual refresh button will surface errors.
        });
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [canManage, profile?.subject, selectedAssignmentId]);

  useEffect(() => {
    if (!selectedMaterialId && assignableMaterials[0]) {
      setSelectedMaterialId(assignableMaterials[0].id);
    }
  }, [assignableMaterials, selectedMaterialId]);

  useEffect(() => {
    if (!selectedLessonId && lessonHomeworkOptions[0]) {
      setSelectedLessonId(lessonHomeworkOptions[0].id);
    }
  }, [lessonHomeworkOptions, selectedLessonId]);

  const studentScore = useMemo(() => {
    if (!studentDetail) {
      return null;
    }
    const savedAnswers = JSON.stringify(materialAnswersFromSubmission(studentDetail.submission));
    const currentAnswers = JSON.stringify(answers);
    const liveScore = materialLiveScore(studentDetail.material, answers);
    return currentAnswers !== savedAnswers && liveScore !== null
      ? liveScore
      : studentDetail.submission.score ?? liveScore;
  }, [answers, studentDetail?.assignment.id, studentDetail?.submission.updatedAt]);

  async function refreshAssignments() {
    if (!profile) {
      return;
    }
    setLoading(true);
    try {
      const items = canManage ? await fetchHomeworkAssignments() : await fetchMyHomeworkAssignments();
      const nextSelectedId = selectedAssignmentId && items.some((item) => item.id === selectedAssignmentId)
        ? selectedAssignmentId
        : items[0]?.id ?? null;
      setAssignments(items);
      setSelectedAssignmentId(nextSelectedId);
      if (nextSelectedId) {
        if (canManage) {
          const loaded = await fetchHomeworkAssignment(nextSelectedId);
          setDetail(loaded);
          setStudentDetail(null);
        } else {
          const loaded = await fetchMyHomeworkAssignment(nextSelectedId);
          setStudentDetail(loaded);
          setDetail(null);
          setAnswers(materialAnswersFromSubmission(loaded.submission));
        }
      } else {
        setDetail(null);
        setStudentDetail(null);
      }
      setLastLoadedAt(new Date().toISOString());
      setMessage(t("homework.messages.refreshed"));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : t("homework.messages.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function createStandaloneHomework() {
    if (!selectedMaterialId || selectedSubjects.length === 0) {
      setMessage(t("homework.messages.selectMaterialAndStudents"));
      return;
    }
    setSaving(true);
    try {
      const created = await createHomeworkAssignment({
        dueAt: localDateTimeToIso(dueAt),
        instructions: instructions.trim() || null,
        materialId: selectedMaterialId,
        studentSubjects: selectedSubjects,
        title: title.trim() || null,
      });
      await refreshAssignments();
      setSelectedAssignmentId(created.assignment.id);
      setDetail(created);
      setMessage(t("homework.messages.created"));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : t("homework.messages.createFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function createFromLesson() {
    if (!selectedLessonId) {
      setMessage(t("homework.messages.selectLesson"));
      return;
    }
    setSaving(true);
    try {
      const created = await createHomeworkFromScheduledLesson(selectedLessonId, {
        dueAt: localDateTimeToIso(dueAt),
        instructions: instructions.trim() || null,
        title: title.trim() || null,
      });
      await refreshAssignments();
      setSelectedAssignmentId(created.assignment.id);
      setDetail(created);
      setMessage(t("homework.messages.createdFromLesson"));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : t("homework.messages.createFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function submitStudentHomework() {
    if (!studentDetail) {
      return;
    }
    setSaving(true);
    try {
      const saved = await saveMyHomeworkAssignmentSubmission(studentDetail.assignment.id, {
        content: {
          schemaVersion: 1,
          materialId: studentDetail.material.id,
          answers,
        } satisfies LessonMaterialJson,
        submitted: true,
      });
      setStudentDetail({ ...studentDetail, submission: saved });
      setMessage(t("homework.messages.submitted"));
      await refreshAssignments();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : t("homework.messages.submitFailed"));
    } finally {
      setSaving(false);
    }
  }

  function updateAnswer(blockId: string, answer: MaterialAnswerBlock) {
    setAnswers((current) => ({
      ...current,
      [blockId]: answer,
    }));
  }

  function toggleSubject(subject: string) {
    setSelectedSubjects((current) => (
      current.includes(subject)
        ? current.filter((item) => item !== subject)
        : [...current, subject]
    ));
  }

  function selectVisibleStudents() {
    setSelectedSubjects((current) => {
      const next = new Set(current);
      filteredStudentUsers.forEach((student) => next.add(student.subject));
      return Array.from(next);
    });
  }

  function clearVisibleStudents() {
    const visibleSubjects = new Set(filteredStudentUsers.map((student) => student.subject));
    setSelectedSubjects((current) => current.filter((subject) => !visibleSubjects.has(subject)));
  }

  return (
    <section className="playsay-homework-panel rounded-[1.25rem] border border-border bg-white/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <BookOpenCheck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-extrabold">{t("homework.title")}</h2>
        </div>
        <Button disabled={disabled || loading} onClick={() => void refreshAssignments()} type="button" variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t("common.actions.refresh")}
        </Button>
      </div>

      {!profile ? (
        <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
          {t("homework.loginRequired")}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(18rem,24rem)_1fr]">
          <div className="grid gap-4">
            {canManage ? (
              <div className="grid gap-3 rounded-2xl border border-border bg-muted/35 p-3">
                <h3 className="text-sm font-extrabold">{t("homework.create.title")}</h3>
                <FormField label={t("homework.create.titleLabel")}>
                  <input
                    className="playsay-input"
                    disabled={disabled || saving}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={t("homework.create.titlePlaceholder")}
                    value={title}
                  />
                </FormField>
                <FormField label={t("homework.create.dueAt")}>
                  <input
                    className="playsay-input"
                    disabled={disabled || saving}
                    onChange={(event) => setDueAt(event.target.value)}
                    type="datetime-local"
                    value={dueAt}
                  />
                </FormField>
                <FormField label={t("homework.create.instructions")}>
                  <textarea
                    className="playsay-input min-h-20 resize-y"
                    disabled={disabled || saving}
                    onChange={(event) => setInstructions(event.target.value)}
                    placeholder={t("homework.create.instructionsPlaceholder")}
                    value={instructions}
                  />
                </FormField>
                <FormField label={t("homework.create.material")}>
                  <select
                    className="playsay-input"
                    disabled={disabled || saving || assignableMaterials.length === 0}
                    onChange={(event) => setSelectedMaterialId(event.target.value)}
                    value={selectedMaterialId}
                  >
                    {assignableMaterials.map((material) => (
                      <option key={material.id} value={material.id}>
                        {material.title}
                      </option>
                    ))}
                  </select>
                </FormField>
                <div className="grid gap-1 text-xs font-extrabold text-muted-foreground">
                  <span>{t("homework.create.students")}</span>
                  <div className="grid gap-2 rounded-2xl border border-border bg-white p-2">
                    <input
                      className="playsay-input"
                      disabled={disabled || saving || studentUsers.length === 0}
                      onChange={(event) => setStudentSearch(event.target.value)}
                      placeholder={t("homework.create.studentSearch")}
                      value={studentSearch}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={disabled || saving || filteredStudentUsers.length === 0}
                        onClick={selectVisibleStudents}
                        type="button"
                        variant="outline"
                      >
                        {t("homework.create.selectVisible")}
                      </Button>
                      <Button
                        disabled={disabled || saving || filteredStudentUsers.length === 0}
                        onClick={clearVisibleStudents}
                        type="button"
                        variant="outline"
                      >
                        {t("homework.create.clearVisible")}
                      </Button>
                    </div>
                    <div className="flex max-h-44 flex-wrap gap-2 overflow-auto">
                      {studentUsers.length === 0 ? (
                        <span className="text-xs font-bold text-muted-foreground">{t("homework.create.noStudents")}</span>
                      ) : filteredStudentUsers.length === 0 ? (
                        <span className="text-xs font-bold text-muted-foreground">{t("homework.create.noStudentMatches")}</span>
                      ) : (
                        filteredStudentUsers.map((student) => (
                          <label className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1 text-xs font-extrabold text-muted-foreground" key={student.subject}>
                            <input
                              checked={selectedSubjects.includes(student.subject)}
                              disabled={disabled || saving}
                              onChange={() => toggleSubject(student.subject)}
                              type="checkbox"
                            />
                            {student.displayName ?? student.username ?? student.subject}
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                <Button disabled={disabled || saving} onClick={() => void createStandaloneHomework()} type="button">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
                  {t("homework.create.assign")}
                </Button>
                <div className="grid gap-2 border-t border-border pt-3">
                  <FormField label={t("homework.create.lesson")}>
                    <select
                      className="playsay-input"
                      disabled={disabled || saving || lessonHomeworkOptions.length === 0}
                      onChange={(event) => setSelectedLessonId(event.target.value)}
                      value={selectedLessonId}
                    >
                      {lessonHomeworkOptions.map((lesson) => (
                        <option key={lesson.id} value={lesson.id}>
                          {lesson.lessonTitle ?? lesson.courseTitle ?? lesson.materialTitle ?? t("schedule.lessonFallbackTitle")}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <Button disabled={disabled || saving || lessonHomeworkOptions.length === 0} onClick={() => void createFromLesson()} type="button" variant="outline">
                    <BookOpenCheck className="h-4 w-4" />
                    {t("homework.create.fromLesson")}
                  </Button>
                </div>
              </div>
            ) : null}

            {message ? (
              <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
                {message}
              </div>
            ) : null}

            <div className="grid gap-2">
              {assignments.length === 0 ? (
                <div className="rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
                  {canManage ? t("homework.empty.teacher") : t("homework.empty.student")}
                </div>
              ) : assignments.map((assignment) => (
                <button
                  className="rounded-2xl border border-border bg-white p-3 text-left transition hover:border-primary/40"
                  data-active={assignment.id === selectedAssignmentId ? "true" : "false"}
                  key={assignment.id}
                  onClick={() => setSelectedAssignmentId(assignment.id)}
                  type="button"
                >
                  <span className="block text-sm font-extrabold text-foreground">{assignment.title}</span>
                  <span className="mt-1 block text-xs font-bold text-muted-foreground">{assignment.materialTitle}</span>
                  <span className="mt-2 flex flex-wrap gap-2">
                    <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-extrabold text-muted-foreground">
                      {t("homework.summary.progress", {
                        scored: assignment.scoredCount,
                        total: assignment.recipientCount,
                      })}
                    </span>
                    {assignment.dueAt ? (
                      <span className="inline-flex rounded-full bg-[#fff3eb] px-2 py-1 text-xs font-extrabold text-primary">
                        {t("homework.summary.dueAt", { date: formatHomeworkDate(assignment.dueAt) })}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            {canManage ? (
              <TeacherHomeworkDetail assignment={selectedAssignment} detail={detail} lastLoadedAt={lastLoadedAt} />
            ) : (
              <StudentHomeworkDetailView
                answers={answers}
                detail={studentDetail}
                disabled={disabled || saving}
                onAnswerChange={updateAnswer}
                onSubmit={() => void submitStudentHomework()}
                saving={saving}
                score={studentScore}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function TeacherHomeworkDetail({
  assignment,
  detail,
  lastLoadedAt,
}: {
  assignment: HomeworkAssignment | null;
  detail: HomeworkAssignmentDetail | null;
  lastLoadedAt: string | null;
}) {
  const { t } = useAppTranslation();
  const [recipientSearch, setRecipientSearch] = useState("");
  const [progressFilter, setProgressFilter] = useState<HomeworkProgressFilter>("all");
  const active = detail?.assignment ?? assignment;
  if (!active) {
    return (
      <div className="rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
        {t("homework.detail.empty")}
      </div>
    );
  }

  const recipients = detail?.recipients ?? [];
  const visibleRecipients = recipients.filter((recipient) => {
    const query = recipientSearch.trim().toLocaleLowerCase();
    const matchesQuery = !query || recipientSearchText(recipient).includes(query);
    if (!matchesQuery) {
      return false;
    }
    if (progressFilter === "missing") {
      return !recipient.submitted;
    }
    if (progressFilter === "errors") {
      return (recipient.errorsCount ?? 0) > 0;
    }
    return true;
  });

  return (
    <div className="grid gap-4 rounded-2xl border border-border bg-white p-4">
      <div>
        <h3 className="text-lg font-extrabold">{active.title}</h3>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">{active.materialTitle}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-extrabold text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-1">
            {t("homework.summary.recipients", { count: active.recipientCount })}
          </span>
          <span className="rounded-full bg-muted px-2 py-1">
            {t("homework.summary.scored", { count: active.scoredCount })}
          </span>
          {active.dueAt ? (
            <span className="rounded-full bg-muted px-2 py-1">
              {t("homework.summary.dueAt", { date: formatHomeworkDate(active.dueAt) })}
            </span>
          ) : null}
          {typeof active.averageScore === "number" ? (
            <span className="rounded-full bg-[#fff3eb] px-2 py-1 text-primary">
              {t("homework.summary.average", { score: formatMaterialScore(active.averageScore) })}
            </span>
          ) : null}
          {lastLoadedAt ? (
            <span className="rounded-full bg-muted px-2 py-1">
              {t("homework.summary.updatedAt", { time: formatSubmissionTime(lastLoadedAt) })}
            </span>
          ) : null}
        </div>
        {active.instructions ? (
          <div className="mt-3 rounded-xl border border-border bg-muted/45 p-3 text-sm font-semibold text-muted-foreground">
            <span className="mb-1 block text-xs font-extrabold uppercase text-primary">{t("homework.detail.instructions")}</span>
            {active.instructions}
          </div>
        ) : null}
      </div>

      <div className="grid gap-2">
        {recipients.length > 0 ? (
          <div className="grid gap-2 rounded-xl border border-border bg-muted/35 p-2">
            <input
              className="playsay-input"
              onChange={(event) => setRecipientSearch(event.target.value)}
              placeholder={t("homework.filters.search")}
              value={recipientSearch}
            />
            <div className="flex flex-wrap gap-2">
              {(["all", "missing", "errors"] as HomeworkProgressFilter[]).map((filter) => (
                <Button
                  data-active={progressFilter === filter ? "true" : "false"}
                  key={filter}
                  onClick={() => setProgressFilter(filter)}
                  type="button"
                  variant={progressFilter === filter ? "default" : "outline"}
                >
                  {t(`homework.filters.${filter}`)}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {recipients.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/60 p-3 text-sm font-semibold text-muted-foreground">
            {t("homework.detail.noProgress")}
          </div>
        ) : visibleRecipients.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/60 p-3 text-sm font-semibold text-muted-foreground">
            {t("homework.detail.noFilteredProgress")}
          </div>
        ) : (
          visibleRecipients.map((recipient) => (
            <RecipientProgressRow key={recipient.studentUserId} recipient={recipient} />
          ))
        )}
      </div>
    </div>
  );
}

function RecipientProgressRow({ recipient }: { recipient: HomeworkRecipientProgress }) {
  const { t } = useAppTranslation();
  const tone = recipient.progressTone ?? 0;
  return (
    <div className="rounded-xl border border-border bg-muted/35 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-extrabold">{recipient.studentName ?? recipient.studentSubject}</span>
        <span className="text-xs font-extrabold text-muted-foreground">
          {recipient.score === null || recipient.score === undefined
            ? t("homework.progress.notScored")
            : t("homework.progress.score", {
                errors: recipient.errorsCount ?? 0,
                score: formatMaterialScore(recipient.score),
              })}
        </span>
      </div>
      {recipient.showGroupIndicator ? (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
          <div
            className="h-full rounded-full"
            style={{
              backgroundColor: progressToneColor(tone),
              width: `${tone}%`,
            }}
          />
        </div>
      ) : (
        <p className="mt-2 text-xs font-bold text-muted-foreground">{t("homework.progress.groupOnly")}</p>
      )}
      <div className="mt-2 text-xs font-bold text-muted-foreground">
        {recipient.updatedAt ? formatSubmissionTime(recipient.updatedAt) : t("homework.progress.notStarted")}
      </div>
    </div>
  );
}

function StudentHomeworkDetailView({
  answers,
  detail,
  disabled,
  onAnswerChange,
  onSubmit,
  saving,
  score,
}: {
  answers: MaterialAnswerState;
  detail: StudentHomeworkDetail | null;
  disabled: boolean;
  onAnswerChange: (blockId: string, answer: MaterialAnswerBlock) => void;
  onSubmit: () => void;
  saving: boolean;
  score: number | null;
}) {
  const { t } = useAppTranslation();
  if (!detail) {
    return (
      <div className="rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
        {t("homework.detail.empty")}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-border bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold">{detail.assignment.title}</h3>
            <p className="text-sm font-semibold text-muted-foreground">{detail.assignment.materialTitle}</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#fff3eb] px-3 py-1 text-sm font-extrabold text-primary">
            <CheckCircle2 className="h-4 w-4" />
            {formatMaterialScore(score)}
          </span>
        </div>
        <div className="mb-3 flex flex-wrap gap-2 text-xs font-extrabold text-muted-foreground">
          {detail.assignment.dueAt ? (
            <span className="rounded-full bg-muted px-2 py-1">
              {t("homework.summary.dueAt", { date: formatHomeworkDate(detail.assignment.dueAt) })}
            </span>
          ) : null}
        </div>
        {detail.assignment.instructions ? (
          <div className="mb-3 rounded-xl border border-border bg-muted/45 p-3 text-sm font-semibold text-muted-foreground">
            <span className="mb-1 block text-xs font-extrabold uppercase text-primary">{t("homework.detail.instructions")}</span>
            {detail.assignment.instructions}
          </div>
        ) : null}
        <LessonMaterialDocumentView
          answers={answers}
          material={detail.material}
          mode="classroom"
          onAnswerChange={onAnswerChange}
          score={score}
          showScoreBadge={false}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={disabled} onClick={onSubmit} type="button">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {saving ? t("homework.actions.submitting") : t("homework.actions.submit")}
        </Button>
        <span className="text-sm font-bold text-muted-foreground">
          {detail.submission.submittedAt
            ? t("homework.submission.submittedAt", { time: formatSubmissionTime(detail.submission.submittedAt) })
            : t("homework.submission.draft")}
        </span>
      </div>
    </div>
  );
}

function localDateTimeToIso(value: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatHomeworkDate(value?: string | null): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function studentSearchText(student: AdminUserProfile): string {
  return [
    student.displayName,
    student.username,
    student.email,
    student.subject,
  ].filter(Boolean).join(" ").toLocaleLowerCase();
}

function recipientSearchText(recipient: HomeworkRecipientProgress): string {
  return [
    recipient.studentName,
    recipient.studentSubject,
  ].filter(Boolean).join(" ").toLocaleLowerCase();
}

function progressToneColor(tone: number): string {
  const hue = Math.round((Math.max(0, Math.min(100, tone)) / 100) * 120);
  return `hsl(${hue} 72% 42%)`;
}
