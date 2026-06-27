import { useEffect, useState, type FormEvent } from "react";
import { Plus, Search, Users, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { FormField } from "../../../shared/ui/FormField";
import {
  defaultScheduleForm,
  isWeeklyRecurrenceValid,
  localScheduleDateTimeToIso,
  localScheduleEndIso,
  scheduleRecurrenceInput,
  scheduleWeekdays,
  selectedParticipantSubjects,
  type CourseLessonOption,
  type ScheduleFormState,
  weekdayFromLocalDate,
} from "../../../entities/schedule/model";
import type { AdminUserProfile, LessonMaterial, ScheduledLessonInput } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

export function ScheduleCreateForm({
  disabled,
  lessonOptions,
  materials,
  onCreate,
  studentUsers,
}: {
  disabled: boolean;
  lessonOptions: CourseLessonOption[];
  materials: LessonMaterial[];
  onCreate: (input: ScheduledLessonInput) => void;
  studentUsers: AdminUserProfile[];
}) {
  const { t } = useAppTranslation();
  const [form, setForm] = useState<ScheduleFormState>(() => defaultScheduleForm(lessonOptions[0]?.id ?? ""));
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [draftStudentSubjects, setDraftStudentSubjects] = useState<string[]>([]);
  const materialOptions = materials.filter((material) => material.status !== "ARCHIVED");
  const selectedSubjects = selectedParticipantSubjects(form.participantSubjects);
  const showParallelAssignments = form.workMode === "PARALLEL" && selectedSubjects.length > 1;
  const needsStudent = studentUsers.length > 0 && selectedSubjects.length === 0;
  const recurrenceInvalid = !isWeeklyRecurrenceValid(form);
  const createDisabledReason = needsStudent ? "student" : recurrenceInvalid ? "recurrence" : disabled ? "busy" : null;
  const createDisabled = Boolean(createDisabledReason);
  const selectedMaterialId = showParallelAssignments ? form.defaultParallelMaterialId : form.materialId;
  const selectedMaterialTitle = materialOptions.find((material) => material.id === selectedMaterialId)?.title ?? t("schedule.form.noMaterial");
  const selectedStudentSummary = selectedSubjects.length === 0
    ? t("schedule.form.noStudentsSelected")
    : t("schedule.form.selectedStudents", { count: selectedSubjects.length });
  const selectedStudentLabels = selectedSubjects
    .map((subject) => studentLabel(studentUsers.find((student) => student.subject === subject)) ?? subject)
    .filter(Boolean);
  const createHint = createDisabledReason === "student"
    ? t("schedule.form.createRequiresStudent")
    : createDisabledReason === "recurrence"
      ? t("schedule.form.createRequiresRecurrence")
      : null;

  useEffect(() => {
    setForm((current) => {
      const selectedOption = lessonOptions.find((option) => option.id === current.lessonTemplateId) ?? lessonOptions[0];
      if (!selectedOption) {
        return current;
      }
      return {
        ...current,
        lessonTemplateId: current.lessonTemplateId || selectedOption.id,
        materialId: current.materialId || selectedOption.materialId,
        defaultParallelMaterialId: current.defaultParallelMaterialId || selectedOption.materialId,
      };
    });
  }, [lessonOptions]);

  function updateField<Key extends keyof ScheduleFormState>(field: Key, value: ScheduleFormState[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateScheduledDate(value: string) {
    setForm((current) => ({
      ...current,
      scheduledDate: value,
      recurrenceWeekdays: current.recurrenceMode === "WEEKLY" && current.recurrenceWeekdays.length === 0
        ? [weekdayFromLocalDate(value)]
        : current.recurrenceWeekdays,
    }));
  }

  function updateRecurrenceMode(value: ScheduleFormState["recurrenceMode"]) {
    setForm((current) => ({
      ...current,
      recurrenceMode: value,
      recurrenceWeekdays: value === "WEEKLY" && current.recurrenceWeekdays.length === 0
        ? [weekdayFromLocalDate(current.scheduledDate)]
        : current.recurrenceWeekdays,
    }));
  }

  function toggleRecurrenceWeekday(weekday: string) {
    setForm((current) => {
      const selected = current.recurrenceWeekdays.includes(weekday);
      return {
        ...current,
        recurrenceWeekdays: selected
          ? current.recurrenceWeekdays.filter((item) => item !== weekday)
          : [...current.recurrenceWeekdays, weekday],
      };
    });
  }

  function selectLessonTemplate(lessonTemplateId: string) {
    const selectedOption = lessonOptions.find((option) => option.id === lessonTemplateId);
    setForm((current) => ({
      ...current,
      lessonTemplateId,
      materialId: selectedOption?.materialId ?? "",
      defaultParallelMaterialId: selectedOption?.materialId ?? "",
      participantMaterialIds: {},
    }));
  }

  function openStudentPicker() {
    setDraftStudentSubjects(selectedSubjects);
    setStudentSearchQuery("");
    setStudentPickerOpen(true);
  }

  function applyStudentPicker() {
    setForm((current) => {
      const nextMaterialIds = { ...current.participantMaterialIds };
      Object.keys(nextMaterialIds).forEach((subject) => {
        if (!draftStudentSubjects.includes(subject)) {
          delete nextMaterialIds[subject];
        }
      });
      return {
        ...current,
        participantMaterialIds: nextMaterialIds,
        participantSubjects: draftStudentSubjects.join(", "),
      };
    });
    setStudentPickerOpen(false);
    setStudentSearchQuery("");
  }

  function updateParticipantMaterial(subject: string, materialId: string) {
    setForm((current) => ({
      ...current,
      participantMaterialIds: {
        ...current.participantMaterialIds,
        [subject]: materialId,
      },
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const participantSubjects = form.participantSubjects
      .split(",")
      .map((subject) => subject.trim())
      .filter(Boolean);
    const participantAssignments = buildParticipantAssignments(
      participantSubjects,
      form.defaultParallelMaterialId,
      form.participantMaterialIds,
    );

    onCreate({
      lessonTemplateId: form.lessonTemplateId || null,
      materialId: form.workMode === "PARALLEL"
        ? participantAssignments.length === 0
          ? form.defaultParallelMaterialId || null
          : null
        : form.materialId || null,
      scheduledStart: localScheduleDateTimeToIso(form.scheduledDate, form.scheduledTime),
      scheduledEnd: localScheduleEndIso(form.scheduledDate, form.scheduledTime, form.durationMinutes),
      status: "SCHEDULED",
      type: form.type,
      workMode: showParallelAssignments ? "PARALLEL" : "SHARED",
      participantSubjects,
      participantAssignments: showParallelAssignments ? participantAssignments : [],
      recurrence: scheduleRecurrenceInput(form),
    });
  }

  return (
    <form
      className="playsay-schedule-create-form"
      data-schedule-create-reason={createDisabledReason ?? "ready"}
      data-schedule-quick-create="true"
      onSubmit={submit}
    >
      <div className="playsay-schedule-create-head">
        <div>
          <h3>{t("schedule.form.quickTitle")}</h3>
          <p>{t("schedule.form.quickSubtitle")}</p>
        </div>
      </div>

      <div className="playsay-schedule-step-row" aria-hidden="true">
        <div className="playsay-schedule-step">
          <span>1</span>
          <strong>{t("schedule.form.stepStudents")}</strong>
          <small>{selectedStudentSummary}</small>
        </div>
        <div className="playsay-schedule-step">
          <span>2</span>
          <strong>{t("schedule.form.stepTime")}</strong>
          <small>{form.scheduledDate} · {form.scheduledTime}</small>
        </div>
        <div className="playsay-schedule-step">
          <span>3</span>
          <strong>{t("schedule.form.stepMaterial")}</strong>
          <small>{selectedMaterialTitle}</small>
        </div>
      </div>

      <div className="playsay-schedule-create-main">
        <FormField label={t("schedule.form.students")}>
          {studentUsers.length === 0 ? (
            <input
              className="playsay-input"
              disabled={disabled}
              name="studentSubjects"
              onChange={(event) => updateField("participantSubjects", event.target.value)}
              placeholder={t("schedule.form.studentsPlaceholder")}
              value={form.participantSubjects}
            />
          ) : (
            <div className="playsay-schedule-student-picker" data-schedule-student-picker="summary">
              <input name="studentSubjects" readOnly type="hidden" value={form.participantSubjects} />
              <div className="playsay-schedule-student-summary">
                <span>{selectedStudentSummary}</span>
                <small>
                  {selectedStudentLabels.length > 0
                    ? selectedStudentLabels.join(", ")
                    : t("schedule.form.studentsPickerHint")}
                </small>
              </div>
              <Button
                data-schedule-student-picker-open="true"
                disabled={disabled}
                onClick={openStudentPicker}
                type="button"
                variant="outline"
              >
                <Users className="h-4 w-4" />
                {t("schedule.form.chooseStudents")}
              </Button>
            </div>
          )}
        </FormField>

        <div className="playsay-schedule-time-grid" data-schedule-time-grid="true">
          <FormField label={t("schedule.form.date")}>
            <input
              className="playsay-input"
              disabled={disabled}
              name="scheduledDate"
              onChange={(event) => updateScheduledDate(event.target.value)}
              required
              type="date"
              value={form.scheduledDate}
            />
          </FormField>
          <FormField label={t("schedule.form.time")}>
            <input
              className="playsay-input"
              disabled={disabled}
              name="scheduledTime"
              onChange={(event) => updateField("scheduledTime", event.target.value)}
              required
              type="time"
              value={form.scheduledTime}
            />
          </FormField>
          <div data-schedule-duration-field="true">
            <FormField label={t("schedule.form.duration")}>
              <input
                className="playsay-input"
                disabled={disabled}
                min={1}
                name="durationMinutes"
                onChange={(event) => updateField("durationMinutes", event.target.value)}
                required
                step={5}
                type="number"
                value={form.durationMinutes}
              />
            </FormField>
          </div>
        </div>
      </div>

      <ScheduleStudentPickerDialog
        disabled={disabled}
        draftSubjects={draftStudentSubjects}
        onApply={applyStudentPicker}
        onClose={() => setStudentPickerOpen(false)}
        onDraftSubjectsChange={setDraftStudentSubjects}
        onSearchQueryChange={setStudentSearchQuery}
        open={studentPickerOpen}
        searchQuery={studentSearchQuery}
        studentUsers={studentUsers}
      />

      <div className="playsay-schedule-recurrence" data-schedule-recurrence="true">
        <div className="playsay-schedule-recurrence-grid">
          <FormField label={t("schedule.form.repeat")}>
            <select
              className="playsay-input"
              disabled={disabled}
              name="recurrenceMode"
              onChange={(event) => updateRecurrenceMode(event.target.value as ScheduleFormState["recurrenceMode"])}
              value={form.recurrenceMode}
            >
              <option value="NONE">{t("schedule.recurrence.none")}</option>
              <option value="WEEKLY">{t("schedule.recurrence.weekly")}</option>
            </select>
          </FormField>
          {form.recurrenceMode === "WEEKLY" ? (
            <FormField label={t("schedule.form.recurrenceCount")}>
              <input
                className="playsay-input"
                disabled={disabled}
                max={52}
                min={2}
                name="recurrenceCount"
                onChange={(event) => updateField("recurrenceCount", event.target.value)}
                required
                type="number"
                value={form.recurrenceCount}
              />
            </FormField>
          ) : null}
        </div>
        {form.recurrenceMode === "WEEKLY" ? (
          <div className="flex flex-wrap gap-2" data-schedule-recurrence-weekdays="true">
            {scheduleWeekdays.map((weekday) => (
              <label className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-extrabold" key={weekday}>
                <input
                  checked={form.recurrenceWeekdays.includes(weekday)}
                  disabled={disabled}
                  name="recurrenceWeekdays"
                  onChange={() => toggleRecurrenceWeekday(weekday)}
                  type="checkbox"
                  value={weekday}
                />
                <span>{t(`schedule.weekdaysShort.${weekday}`)}</span>
              </label>
            ))}
          </div>
        ) : null}
      </div>

      <FormField label={showParallelAssignments ? t("schedule.form.parallelDefaultMaterial") : t("schedule.form.directMaterial")}>
        <select
          className="playsay-input"
          disabled={disabled || materialOptions.length === 0}
          name={showParallelAssignments ? "defaultParallelMaterialId" : "materialId"}
          onChange={(event) => (
            showParallelAssignments
              ? updateField("defaultParallelMaterialId", event.target.value)
              : updateField("materialId", event.target.value)
          )}
          value={showParallelAssignments ? form.defaultParallelMaterialId : form.materialId}
        >
          <option value="">{t("schedule.form.noMaterial")}</option>
          {materialOptions.map((material) => (
            <option key={material.id} value={material.id}>
              {material.title}
            </option>
          ))}
        </select>
      </FormField>

      <details className="playsay-schedule-advanced" data-schedule-advanced="true">
        <summary>
          {t("schedule.form.advanced")}
        </summary>
        <div className="grid gap-3 border-t border-border p-3">
          <FormField label={t("schedule.form.lessonTemplate")}>
            <select
              className="playsay-input"
              disabled={disabled}
              name="lessonTemplateId"
              onChange={(event) => selectLessonTemplate(event.target.value)}
              value={form.lessonTemplateId}
            >
              <option value="">{t("schedule.form.noTemplate")}</option>
              {lessonOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t("schedule.form.format")}>
              <select
                className="playsay-input"
                disabled={disabled}
                name="type"
                onChange={(event) => updateField("type", event.target.value as ScheduleFormState["type"])}
                value={form.type}
              >
                <option value="INDIVIDUAL">{t("schedule.lessonType.individual")}</option>
                <option value="GROUP">{t("schedule.lessonType.group")}</option>
              </select>
            </FormField>
            <FormField label={t("schedule.form.workMode")}>
              <select
                className="playsay-input"
                disabled={disabled}
                name="workMode"
                onChange={(event) => updateField("workMode", event.target.value as ScheduleFormState["workMode"])}
                value={form.workMode}
              >
                <option value="SHARED">{t("schedule.workMode.shared")}</option>
                <option value="PARALLEL">{t("schedule.workMode.parallel")}</option>
              </select>
            </FormField>
          </div>

          {showParallelAssignments ? (
            <div className="grid gap-2 rounded-2xl border border-border bg-background p-3">
              <div className="text-xs font-extrabold uppercase text-muted-foreground">
                {t("schedule.form.studentMaterials")}
              </div>
              {selectedSubjects.map((subject) => {
                const student = studentUsers.find((item) => item.subject === subject);
                const label = student?.displayName ?? student?.name ?? student?.username ?? subject;
                return (
                  <label className="grid gap-1 text-sm font-extrabold sm:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)] sm:items-center" key={subject}>
                    <span className="min-w-0 truncate">{label}</span>
                    <select
                      className="playsay-input"
                      disabled={disabled || materialOptions.length === 0}
                      onChange={(event) => updateParticipantMaterial(subject, event.target.value)}
                      value={form.participantMaterialIds[subject] ?? ""}
                    >
                      <option value="">{t("schedule.form.useDefaultMaterial")}</option>
                      {materialOptions.map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.title}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>
      </details>

      <div className="playsay-schedule-create-footer">
        {createHint ? (
          <p className="playsay-schedule-create-hint">
            {createHint}
          </p>
        ) : null}
        <Button disabled={createDisabled} title={createHint ?? undefined} type="submit">
          <Plus className="h-4 w-4" />
          {t("schedule.form.createLesson")}
        </Button>
      </div>
    </form>
  );
}

export function ScheduleStudentPickerDialog({
  disabled,
  draftSubjects,
  onApply,
  onClose,
  onDraftSubjectsChange,
  onSearchQueryChange,
  open,
  searchQuery,
  studentUsers,
}: {
  disabled: boolean;
  draftSubjects: string[];
  onApply: () => void;
  onClose: () => void;
  onDraftSubjectsChange: (subjects: string[]) => void;
  onSearchQueryChange: (query: string) => void;
  open: boolean;
  searchQuery: string;
  studentUsers: AdminUserProfile[];
}) {
  const { t } = useAppTranslation();
  const visibleStudents = filterScheduleStudents(studentUsers, searchQuery);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  function toggleDraftSubject(subject: string) {
    const nextSubjects = draftSubjects.includes(subject)
      ? draftSubjects.filter((item) => item !== subject)
      : [...draftSubjects, subject];
    onDraftSubjectsChange(nextSubjects);
  }

  return (
    <div className="playsay-schedule-student-dialog-backdrop">
      <div
        aria-labelledby="schedule-student-picker-title"
        aria-modal="true"
        className="playsay-schedule-student-dialog"
        role="dialog"
      >
        <div className="playsay-schedule-student-dialog-head">
          <div className="min-w-0">
            <h3 id="schedule-student-picker-title">{t("schedule.form.studentsPickerTitle")}</h3>
            <p>{t("schedule.form.studentsPickerSubtitle")}</p>
          </div>
          <Button
            aria-label={t("schedule.form.closeStudentsPicker")}
            onClick={onClose}
            type="button"
            variant="outline"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <label className="playsay-schedule-student-search">
          <Search className="h-4 w-4" />
          <input
            disabled={disabled}
            name="studentSearch"
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder={t("schedule.form.studentSearchPlaceholder")}
            type="search"
            value={searchQuery}
          />
        </label>

        <div className="playsay-schedule-student-dialog-list">
          {visibleStudents.length === 0 ? (
            <div className="playsay-schedule-student-empty">
              {t("schedule.form.noStudentsFound")}
            </div>
          ) : visibleStudents.map((student) => {
            const label = studentLabel(student) ?? student.subject;
            return (
              <label className="playsay-schedule-student-option" key={student.subject}>
                <span className="min-w-0 truncate">{label}</span>
                <input
                  checked={draftSubjects.includes(student.subject)}
                  disabled={disabled}
                  name="studentPickerSubjects"
                  onChange={() => toggleDraftSubject(student.subject)}
                  type="checkbox"
                  value={student.subject}
                />
              </label>
            );
          })}
        </div>

        <div className="playsay-schedule-student-dialog-actions">
          <Button onClick={onClose} type="button" variant="outline">
            {t("schedule.form.cancelStudentsPicker")}
          </Button>
          <Button disabled={disabled} onClick={onApply} type="button">
            {t("schedule.form.applyStudentsPicker")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function filterScheduleStudents(students: AdminUserProfile[], query: string): AdminUserProfile[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return students;
  }

  return students.filter((student) => (
    [student.displayName, student.name, student.username, student.subject]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery))
  ));
}

function studentLabel(student: AdminUserProfile | undefined): string | null {
  return student?.displayName ?? student?.name ?? student?.username ?? student?.subject ?? null;
}

function buildParticipantAssignments(
  participantSubjects: string[],
  defaultMaterialId: string,
  participantMaterialIds: Record<string, string>,
): ScheduledLessonInput["participantAssignments"] {
  const materialBySubject = participantSubjects.reduce<Record<string, string>>((assigned, subject) => {
    const materialId = participantMaterialIds[subject] || defaultMaterialId;
    if (materialId) {
      assigned[subject] = materialId;
    }
    return assigned;
  }, {});
  const materialIds = Array.from(new Set(Object.values(materialBySubject)));

  if (materialIds.length <= 1 && defaultMaterialId && participantSubjects.every((subject) => materialBySubject[subject] === defaultMaterialId)) {
    return [];
  }

  return materialIds.map((materialId) => ({
    materialId,
    participantSubjects: participantSubjects.filter((subject) => materialBySubject[subject] === materialId),
  }));
}
