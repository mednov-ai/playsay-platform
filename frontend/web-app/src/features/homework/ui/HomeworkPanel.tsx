import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpenCheck, Loader2, RefreshCw } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  createHomeworkAssignment,
  createHomeworkFromScheduledLesson,
  createVocabularyHomeworkAssignment,
  type AdminUserProfile,
  type LessonMaterial,
  type MeProfile,
  type ScheduledLesson,
  type VocabularyPracticeMode,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { useHomeworkAssignments } from "../hooks/useHomeworkAssignments";
import { localDateTimeToIso, studentSearchText } from "../model/homeworkUtils";
import { HomeworkAssignmentList } from "./HomeworkAssignmentList";
import { HomeworkCreateForm } from "./HomeworkCreateForm";
import { StudentHomeworkDetailView } from "./StudentHomeworkDetailView";
import { StudentVocabularyHomeworkView } from "./StudentVocabularyHomeworkView";
import { TeacherHomeworkDetail } from "./TeacherHomeworkDetail";

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
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [title, setTitle] = useState("");
  const [contentKind, setContentKind] = useState<"MATERIAL" | "VOCABULARY_PRACTICE">("MATERIAL");
  const [vocabularyMode, setVocabularyMode] = useState<VocabularyPracticeMode>("BALANCED");
  const [vocabularyWordLimit, setVocabularyWordLimit] = useState(10);
  const {
    answers,
    assignments,
    detail,
    draftSaveState,
    draftSaving,
    lastLoadedAt,
    loading,
    message,
    refreshAssignments,
    retryStudentDraftSave,
    saving,
    selectedAssignment,
    selectedAssignmentId,
    setDetail,
    setMessage,
    setSaving,
    setSelectedAssignmentId,
    studentDetail,
    studentVocabularyDetail,
    studentHasUnsavedChanges,
    studentScore,
    submitStudentHomework,
    updateAnswer,
  } = useHomeworkAssignments({ canManage, profile });

  const assignableMaterials = materials.filter((material) => material.status !== "ARCHIVED");
  const lessonHomeworkOptions = scheduledLessons.filter((lesson) => Boolean(lesson.materialId));
  const filteredStudentUsers = useMemo(() => {
    const query = studentSearch.trim().toLocaleLowerCase();
    if (!query) {
      return studentUsers;
    }
    return studentUsers.filter((student) => studentSearchText(student).includes(query));
  }, [studentSearch, studentUsers]);

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

  async function createVocabularyHomework() {
    if (selectedSubjects.length === 0) {
      setMessage(t("homework.messages.selectStudents"));
      return;
    }
    setSaving(true);
    try {
      const created = await createVocabularyHomeworkAssignment({
        dueAt: localDateTimeToIso(dueAt),
        instructions: instructions.trim() || null,
        mode: vocabularyMode,
        studentSubjects: selectedSubjects,
        title: title.trim() || t("homework.create.defaultVocabularyTitle"),
        wordLimit: vocabularyWordLimit,
      });
      await refreshAssignments();
      setSelectedAssignmentId(created.assignment.id);
      setDetail(created);
      setMessage(t("homework.messages.createdVocabulary"));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : t("homework.messages.createFailed"));
    } finally {
      setSaving(false);
    }
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

  function closeStudentAssignment() {
    if (
      studentHasUnsavedChanges
      && studentDetail?.submission.submittedAt
      && !window.confirm(t("homework.confirm.leaveUnsubmittedChanges"))
    ) {
      return;
    }
    setSelectedAssignmentId(null);
  }

  return (
    <section className="playsay-homework-panel rounded-[1.25rem] border border-border bg-white/80 p-4">
      {canManage || !selectedAssignmentId ? (
        <div className={`flex flex-wrap items-center gap-3 border-b border-border pb-4${canManage ? " justify-between" : " justify-end"}`}>
          {canManage ? (
            <div className="flex items-center gap-2">
              <BookOpenCheck className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-extrabold">{t("homework.title")}</h2>
            </div>
          ) : null}
          <Button disabled={disabled || loading} onClick={() => void refreshAssignments()} type="button" variant="outline">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t("common.actions.refresh")}
          </Button>
        </div>
      ) : null}

      {!profile ? (
        <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
          {t("homework.loginRequired")}
        </div>
      ) : canManage ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(18rem,24rem)_1fr]">
          <div className="grid gap-4">
            <HomeworkCreateForm
              assignableMaterials={assignableMaterials}
              contentKind={contentKind}
              disabled={disabled}
              dueAt={dueAt}
              filteredStudentUsers={filteredStudentUsers}
              instructions={instructions}
              lessonHomeworkOptions={lessonHomeworkOptions}
              onClearVisibleStudents={clearVisibleStudents}
              onCreateFromLesson={() => void createFromLesson()}
              onCreateStandaloneHomework={() => void createStandaloneHomework()}
              onCreateVocabularyHomework={() => void createVocabularyHomework()}
              onSelectVisibleStudents={selectVisibleStudents}
              onToggleSubject={toggleSubject}
              saving={saving}
              selectedLessonId={selectedLessonId}
              selectedMaterialId={selectedMaterialId}
              selectedSubjects={selectedSubjects}
              setDueAt={setDueAt}
              setContentKind={setContentKind}
              setInstructions={setInstructions}
              setSelectedLessonId={setSelectedLessonId}
              setSelectedMaterialId={setSelectedMaterialId}
              setStudentSearch={setStudentSearch}
              setTitle={setTitle}
              setVocabularyMode={setVocabularyMode}
              setVocabularyWordLimit={setVocabularyWordLimit}
              studentSearch={studentSearch}
              studentUsers={studentUsers}
              title={title}
              vocabularyMode={vocabularyMode}
              vocabularyWordLimit={vocabularyWordLimit}
            />

            {message ? (
              <div aria-live="polite" className="playsay-homework-inline-message">
                {message}
              </div>
            ) : null}

            <HomeworkAssignmentList
              assignments={assignments}
              canManage={canManage}
              onSelectAssignment={setSelectedAssignmentId}
              selectedAssignmentId={selectedAssignmentId}
            />
          </div>

          <div className="min-w-0">
            <TeacherHomeworkDetail assignment={selectedAssignment} detail={detail} lastLoadedAt={lastLoadedAt} />
          </div>
        </div>
      ) : selectedAssignmentId ? (
        <div className="mt-3">
          {message ? (
            <div aria-live="assertive" className="playsay-homework-inline-message mb-3">
              {message}
            </div>
          ) : null}
          {loading && !studentDetail && !studentVocabularyDetail ? (
            <div className="flex min-h-48 items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : studentVocabularyDetail ? (
            <StudentVocabularyHomeworkView detail={studentVocabularyDetail} onBack={closeStudentAssignment} />
          ) : studentDetail ? (
            <StudentHomeworkDetailView
              answers={answers}
              detail={studentDetail}
              disabled={disabled || saving}
              draftSaveState={draftSaveState}
              draftSaving={draftSaving}
              hasUnsavedChanges={studentHasUnsavedChanges}
              onAnswerChange={updateAnswer}
              onBack={closeStudentAssignment}
              onRetryDraftSave={retryStudentDraftSave}
              onSubmit={() => void submitStudentHomework()}
              saving={saving}
              score={studentScore}
            />
          ) : (
            <Button onClick={closeStudentAssignment} type="button" variant="outline">
              <ArrowLeft className="h-4 w-4" />
              {t("homework.actions.backToList")}
            </Button>
          )}
        </div>
      ) : (
        <div className="mx-auto mt-4 grid max-w-3xl gap-3">
          {message ? (
            <div aria-live="assertive" className="playsay-homework-inline-message">
              {message}
            </div>
          ) : null}
          <HomeworkAssignmentList
            assignments={assignments}
            canManage={false}
            onSelectAssignment={setSelectedAssignmentId}
            selectedAssignmentId={null}
          />
        </div>
      )}
    </section>
  );
}
