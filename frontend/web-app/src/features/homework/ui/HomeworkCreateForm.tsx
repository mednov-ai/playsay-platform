import { BookOpenCheck, ClipboardList, Loader2 } from "lucide-react";
import type { AdminUserProfile, LessonMaterial, ScheduledLesson, VocabularyPracticeMode } from "../../../shared/api/playsay";
import { Button } from "../../../components/ui/button";
import { FormField } from "../../../shared/ui/FormField";
import { useAppTranslation } from "../../../shared/i18n";
import { vocabularyFeatures } from "../../../shared/config/vocabularyFeatures";

export function HomeworkCreateForm({
  assignableMaterials,
  contentKind,
  disabled,
  dueAt,
  filteredStudentUsers,
  instructions,
  lessonHomeworkOptions,
  onClearVisibleStudents,
  onCreateFromLesson,
  onCreateStandaloneHomework,
  onCreateVocabularyHomework,
  onSelectVisibleStudents,
  onToggleSubject,
  saving,
  selectedLessonId,
  selectedMaterialId,
  selectedSubjects,
  setDueAt,
  setContentKind,
  setInstructions,
  setSelectedLessonId,
  setSelectedMaterialId,
  setStudentSearch,
  setTitle,
  setVocabularyMode,
  setVocabularyWordLimit,
  studentSearch,
  studentUsers,
  title,
  vocabularyMode,
  vocabularyWordLimit,
}: {
  assignableMaterials: LessonMaterial[];
  contentKind: "MATERIAL" | "VOCABULARY_PRACTICE";
  disabled: boolean;
  dueAt: string;
  filteredStudentUsers: AdminUserProfile[];
  instructions: string;
  lessonHomeworkOptions: ScheduledLesson[];
  onClearVisibleStudents: () => void;
  onCreateFromLesson: () => void;
  onCreateStandaloneHomework: () => void;
  onCreateVocabularyHomework: () => void;
  onSelectVisibleStudents: () => void;
  onToggleSubject: (subject: string) => void;
  saving: boolean;
  selectedLessonId: string;
  selectedMaterialId: string;
  selectedSubjects: string[];
  setDueAt: (value: string) => void;
  setContentKind: (value: "MATERIAL" | "VOCABULARY_PRACTICE") => void;
  setInstructions: (value: string) => void;
  setSelectedLessonId: (value: string) => void;
  setSelectedMaterialId: (value: string) => void;
  setStudentSearch: (value: string) => void;
  setTitle: (value: string) => void;
  setVocabularyMode: (value: VocabularyPracticeMode) => void;
  setVocabularyWordLimit: (value: number) => void;
  studentSearch: string;
  studentUsers: AdminUserProfile[];
  title: string;
  vocabularyMode: VocabularyPracticeMode;
  vocabularyWordLimit: number;
}) {
  const { t } = useAppTranslation();

  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-muted/35 p-3">
      <h3 className="text-sm font-extrabold">{t("homework.create.title")}</h3>
      {vocabularyFeatures.homework ? <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("homework.create.kind.label")}>
        <Button onClick={() => setContentKind("MATERIAL")} type="button" variant={contentKind === "MATERIAL" ? "default" : "outline"}>{t("homework.create.kind.material")}</Button>
        <Button onClick={() => setContentKind("VOCABULARY_PRACTICE")} type="button" variant={contentKind === "VOCABULARY_PRACTICE" ? "default" : "outline"}>{t("homework.create.kind.words")}</Button>
      </div> : null}
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
      {contentKind === "MATERIAL" ? <FormField label={t("homework.create.material")}>
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
      </FormField> : (
        <div className="grid gap-3 rounded-2xl border border-primary/15 bg-[#fff7f0] p-3">
          <FormField label={t("homework.create.vocabularyMode")}>
            <select className="playsay-input" disabled={disabled || saving} onChange={(event) => setVocabularyMode(event.target.value as VocabularyPracticeMode)} value={vocabularyMode}>
              {(["QUICK", "BALANCED", "WRITING", "KEYBOARD"] as VocabularyPracticeMode[])
                .filter((mode) => mode !== "KEYBOARD" || vocabularyFeatures.key)
                .map((mode) => <option key={mode} value={mode}>{t(`vocabulary.practice.mode.${mode}`)}</option>)}
            </select>
          </FormField>
          <FormField label={t("homework.create.vocabularyWordLimit")}>
            <input className="accent-primary" disabled={disabled || saving} max={20} min={3} onChange={(event) => setVocabularyWordLimit(Number(event.target.value))} type="range" value={vocabularyWordLimit} />
            <span className="text-xs font-extrabold text-muted-foreground">{vocabularyWordLimit}</span>
          </FormField>
        </div>
      )}
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
              onClick={onSelectVisibleStudents}
              type="button"
              variant="outline"
            >
              {t("homework.create.selectVisible")}
            </Button>
            <Button
              disabled={disabled || saving || filteredStudentUsers.length === 0}
              onClick={onClearVisibleStudents}
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
                    onChange={() => onToggleSubject(student.subject)}
                    type="checkbox"
                  />
                  {student.displayName ?? student.username ?? student.subject}
                </label>
              ))
            )}
          </div>
        </div>
      </div>
      <Button disabled={disabled || saving} onClick={contentKind === "MATERIAL" ? onCreateStandaloneHomework : onCreateVocabularyHomework} type="button">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
        {contentKind === "MATERIAL" ? t("homework.create.assign") : t("homework.create.assignVocabulary")}
      </Button>
      {contentKind === "MATERIAL" ? <div className="grid gap-2 border-t border-border pt-3">
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
        <Button disabled={disabled || saving || lessonHomeworkOptions.length === 0} onClick={onCreateFromLesson} type="button" variant="outline">
          <BookOpenCheck className="h-4 w-4" />
          {t("homework.create.fromLesson")}
        </Button>
      </div> : null}
    </div>
  );
}
