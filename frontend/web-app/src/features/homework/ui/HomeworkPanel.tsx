import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Loader2, RefreshCw } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  createHomeworkAssignment,
  createHomeworkFromScheduledLesson,
  type AdminUserProfile,
  type LessonMaterial,
  type MeProfile,
  type ScheduledLesson,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { useHomeworkAssignments } from "../hooks/useHomeworkAssignments";
import { localDateTimeToIso, studentSearchText } from "../model/homeworkUtils";
import { HomeworkAssignmentList } from "./HomeworkAssignmentList";
import { HomeworkCreateForm } from "./HomeworkCreateForm";
import { StudentHomeworkDetailView } from "./StudentHomeworkDetailView";
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
  const {
    answers,
    assignments,
    detail,
    lastLoadedAt,
    loading,
    message,
    refreshAssignments,
    saving,
    selectedAssignment,
    selectedAssignmentId,
    setDetail,
    setMessage,
    setSaving,
    setSelectedAssignmentId,
    studentDetail,
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
              <HomeworkCreateForm
                assignableMaterials={assignableMaterials}
                disabled={disabled}
                dueAt={dueAt}
                filteredStudentUsers={filteredStudentUsers}
                instructions={instructions}
                lessonHomeworkOptions={lessonHomeworkOptions}
                onClearVisibleStudents={clearVisibleStudents}
                onCreateFromLesson={() => void createFromLesson()}
                onCreateStandaloneHomework={() => void createStandaloneHomework()}
                onSelectVisibleStudents={selectVisibleStudents}
                onToggleSubject={toggleSubject}
                saving={saving}
                selectedLessonId={selectedLessonId}
                selectedMaterialId={selectedMaterialId}
                selectedSubjects={selectedSubjects}
                setDueAt={setDueAt}
                setInstructions={setInstructions}
                setSelectedLessonId={setSelectedLessonId}
                setSelectedMaterialId={setSelectedMaterialId}
                setStudentSearch={setStudentSearch}
                setTitle={setTitle}
                studentSearch={studentSearch}
                studentUsers={studentUsers}
                title={title}
              />
            ) : null}

            {message ? (
              <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
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
