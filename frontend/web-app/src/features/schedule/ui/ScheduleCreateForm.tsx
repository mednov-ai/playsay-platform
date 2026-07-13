import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Minus, Plus, Search, UserPlus, Users, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { FormField } from "../../../shared/ui/FormField";
import {
  DURATION_PRESET_MINUTES,
  MAX_SCHEDULE_DURATION_MINUTES,
  MIN_SCHEDULE_DURATION_MINUTES,
  defaultScheduleForm,
  isWeeklyRecurrenceValid,
  localScheduleDateTimeToIso,
  localScheduleEndIso,
  normalizedDurationMinutes,
  scheduleRecurrenceInput,
  scheduleWeekdays,
  selectedParticipantSubjects,
  stepDurationMinutes,
  type CourseLessonOption,
  type ScheduleFormState,
  weekdayFromLocalDate,
} from "../../../entities/schedule/model";
import type { AdminUserProfile, LessonMaterial, ManagedStudentInput, ScheduledLessonInput } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

const managedStudentUsernamePattern = /^[a-z0-9._-]{3,64}$/;
const managedStudentEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function managedStudentInputFromDraft(draft: {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
}): ManagedStudentInput | null {
  const username = draft.username.trim().toLowerCase();
  const firstName = draft.firstName.trim();
  const lastName = draft.lastName.trim();
  const email = draft.email.trim().toLowerCase();
  if (
    !managedStudentUsernamePattern.test(username)
    || !firstName
    || firstName.length > 120
    || lastName.length > 120
    || email.length > 320
    || (email && !managedStudentEmailPattern.test(email))
  ) {
    return null;
  }
  return {
    username,
    firstName,
    ...(lastName ? { lastName } : {}),
    ...(email ? { email } : {}),
  };
}

export function selectedSubjectsAfterManagedStudentCreation(subjects: string[], createdSubject: string): string[] {
  return subjects.includes(createdSubject) ? subjects : [...subjects, createdSubject];
}

export function ScheduleCreateForm({
  disabled,
  lessonOptions,
  managedStudentLoading = false,
  managedStudentMessage = null,
  materials,
  onCreate,
  onCreateManagedStudent,
  studentUsers,
}: {
  disabled: boolean;
  lessonOptions: CourseLessonOption[];
  managedStudentLoading?: boolean;
  managedStudentMessage?: string | null;
  materials: LessonMaterial[];
  onCreate: (input: ScheduledLessonInput) => void;
  onCreateManagedStudent?: (input: ManagedStudentInput) => Promise<AdminUserProfile | null>;
  studentUsers: AdminUserProfile[];
}) {
  const { t } = useAppTranslation();
  const [form, setForm] = useState<ScheduleFormState>(() => defaultScheduleForm(lessonOptions[0]?.id ?? ""));
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [draftStudentSubjects, setDraftStudentSubjects] = useState<string[]>([]);
  const materialOptions = materials.filter((material) => material.status !== "ARCHIVED");
  const selectedSubjects = selectedParticipantSubjects(form.participantSubjects);
  const showStudentPicker = studentUsers.length > 0 || Boolean(onCreateManagedStudent);
  const showParallelAssignments = form.workMode === "PARALLEL" && selectedSubjects.length > 1;
  const selectedRecurrenceWeekdays = scheduleWeekdays.filter((weekday) => form.recurrenceWeekdays.includes(weekday));
  const needsStudent = showStudentPicker && selectedSubjects.length === 0;
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
    setForm((current) => {
      if (current.recurrenceMode !== "WEEKLY" || current.recurrenceWeekdays.length > 0) {
        return { ...current, scheduledDate: value };
      }

      const weekday = weekdayFromLocalDate(value);
      return {
        ...current,
        scheduledDate: value,
        recurrenceWeekdays: [weekday],
        recurrenceWeekdayTimes: {
          ...current.recurrenceWeekdayTimes,
          [weekday]: current.scheduledTime,
        },
      };
    });
  }

  function updateScheduledTime(value: string) {
    updateField("scheduledTime", value);
  }

  function updateDurationMinutes(value: string | number) {
    updateField("durationMinutes", String(value));
  }

  function clampDurationMinutes() {
    setForm((current) => ({
      ...current,
      durationMinutes: String(normalizedDurationMinutes(current.durationMinutes)),
    }));
  }

  function stepDurationMinutesBy(step: number) {
    setForm((current) => ({
      ...current,
      durationMinutes: stepDurationMinutes(current.durationMinutes, step),
    }));
  }

  function updateRecurrenceMode(value: ScheduleFormState["recurrenceMode"]) {
    setForm((current) => {
      if (value !== "WEEKLY" || current.recurrenceWeekdays.length > 0) {
        return { ...current, recurrenceMode: value };
      }

      const weekday = weekdayFromLocalDate(current.scheduledDate);
      return {
        ...current,
        recurrenceMode: value,
        recurrenceWeekdays: [weekday],
        recurrenceWeekdayTimes: {
          ...current.recurrenceWeekdayTimes,
          [weekday]: current.scheduledTime,
        },
      };
    });
  }

  function toggleRecurrenceWeekday(weekday: string) {
    setForm((current) => {
      const selected = current.recurrenceWeekdays.includes(weekday);
      const recurrenceWeekdayTimes = { ...current.recurrenceWeekdayTimes };
      if (selected) {
        delete recurrenceWeekdayTimes[weekday];
      } else {
        recurrenceWeekdayTimes[weekday] = recurrenceWeekdayTimes[weekday] || current.scheduledTime;
      }
      return {
        ...current,
        recurrenceWeekdays: selected
          ? current.recurrenceWeekdays.filter((item) => item !== weekday)
          : [...current.recurrenceWeekdays, weekday],
        recurrenceWeekdayTimes,
      };
    });
  }

  function updateRecurrenceWeekdayTime(weekday: string, time: string) {
    setForm((current) => ({
      ...current,
      recurrenceWeekdayTimes: {
        ...current.recurrenceWeekdayTimes,
        [weekday]: time,
      },
    }));
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
          {!showStudentPicker ? (
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
              onChange={(event) => updateScheduledTime(event.target.value)}
              required
              type="time"
              value={form.scheduledTime}
            />
          </FormField>
          <div data-schedule-duration-field="true">
            <FormField label={t("schedule.form.duration")}>
              <div className="playsay-schedule-duration-control">
                <div className="playsay-schedule-duration-presets" data-schedule-duration-presets="true">
                  {DURATION_PRESET_MINUTES.map((duration) => {
                    const selected = Number.parseInt(form.durationMinutes, 10) === duration;
                    return (
                      <button
                        aria-pressed={selected}
                        className="playsay-schedule-duration-preset"
                        data-selected={selected ? "true" : "false"}
                        disabled={disabled}
                        key={duration}
                        onClick={() => updateDurationMinutes(duration)}
                        type="button"
                      >
                        {duration}
                      </button>
                    );
                  })}
                </div>
                <div className="playsay-schedule-duration-stepper" data-schedule-duration-stepper="true">
                  <button
                    aria-label={t("schedule.form.durationDecrease")}
                    disabled={disabled}
                    onClick={() => stepDurationMinutesBy(-10)}
                    type="button"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="playsay-schedule-duration-value">
                    <input
                      className="playsay-input"
                      disabled={disabled}
                      max={MAX_SCHEDULE_DURATION_MINUTES}
                      min={MIN_SCHEDULE_DURATION_MINUTES}
                      name="durationMinutes"
                      onBlur={clampDurationMinutes}
                      onChange={(event) => updateDurationMinutes(event.target.value)}
                      required
                      step={10}
                      type="number"
                      value={form.durationMinutes}
                    />
                    <span>{t("schedule.form.durationUnit")}</span>
                  </div>
                  <button
                    aria-label={t("schedule.form.durationIncrease")}
                    disabled={disabled}
                    onClick={() => stepDurationMinutesBy(10)}
                    type="button"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </FormField>
          </div>
        </div>
      </div>

      <ScheduleStudentPickerDialog
        disabled={disabled}
        draftSubjects={draftStudentSubjects}
        managedStudentLoading={managedStudentLoading}
        managedStudentMessage={managedStudentMessage}
        onApply={applyStudentPicker}
        onClose={() => setStudentPickerOpen(false)}
        onCreateManagedStudent={onCreateManagedStudent}
        onDraftSubjectsChange={setDraftStudentSubjects}
        onSearchQueryChange={setStudentSearchQuery}
        open={studentPickerOpen}
        searchQuery={studentSearchQuery}
        studentUsers={studentUsers}
      />

      <div className="playsay-schedule-recurrence" data-schedule-recurrence="true">
        <input name="recurrenceMode" type="hidden" value={form.recurrenceMode} />
        <div className="playsay-schedule-recurrence-grid">
          <div
            aria-label={t("schedule.form.recurrenceMode")}
            className="playsay-schedule-recurrence-mode"
            role="group"
          >
            <button
              aria-pressed={form.recurrenceMode === "NONE"}
              data-schedule-recurrence-mode="single"
              data-selected={form.recurrenceMode === "NONE" ? "true" : "false"}
              disabled={disabled}
              onClick={() => updateRecurrenceMode("NONE")}
              type="button"
            >
              {t("schedule.recurrence.none")}
            </button>
            <button
              aria-pressed={form.recurrenceMode === "WEEKLY"}
              data-schedule-recurrence-mode="weekly"
              data-selected={form.recurrenceMode === "WEEKLY" ? "true" : "false"}
              disabled={disabled}
              onClick={() => updateRecurrenceMode("WEEKLY")}
              type="button"
            >
              {t("schedule.recurrence.weekly")}
            </button>
          </div>
          {form.recurrenceMode === "WEEKLY" ? (
            <FormField label={t("schedule.form.recurrenceWeeks")}>
              <input
                className="playsay-input"
                disabled={disabled}
                max={52}
                min={1}
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
          <div className="playsay-schedule-weekly-grid">
            <div className="playsay-schedule-weekdays" data-schedule-recurrence-weekdays="true">
              {scheduleWeekdays.map((weekday) => {
                const selected = form.recurrenceWeekdays.includes(weekday);
                return (
                  <button
                    aria-pressed={selected}
                    data-selected={selected ? "true" : "false"}
                    disabled={disabled}
                    key={weekday}
                    onClick={() => toggleRecurrenceWeekday(weekday)}
                    type="button"
                  >
                    {t(`schedule.weekdaysShort.${weekday}`)}
                  </button>
                );
              })}
            </div>
            {selectedRecurrenceWeekdays.length > 0 ? (
              <div className="playsay-schedule-weekday-times" data-schedule-recurrence-weekday-times="true">
                <div>{t("schedule.form.weekdayTimes")}</div>
                {selectedRecurrenceWeekdays.map((weekday) => (
                  <label key={weekday}>
                    <span>{t(`schedule.weekdaysShort.${weekday}`)}</span>
                    <input
                      className="playsay-input"
                      disabled={disabled}
                      name={`recurrenceWeekdayTimes.${weekday}`}
                      onChange={(event) => updateRecurrenceWeekdayTime(weekday, event.target.value)}
                      required
                      type="time"
                      value={form.recurrenceWeekdayTimes[weekday] ?? form.scheduledTime}
                    />
                  </label>
                ))}
              </div>
            ) : null}
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
  managedStudentLoading = false,
  managedStudentMessage = null,
  onApply,
  onClose,
  onCreateManagedStudent,
  onDraftSubjectsChange,
  onSearchQueryChange,
  open,
  searchQuery,
  studentUsers,
}: {
  disabled: boolean;
  draftSubjects: string[];
  managedStudentLoading?: boolean;
  managedStudentMessage?: string | null;
  onApply: () => void;
  onClose: () => void;
  onCreateManagedStudent?: (input: ManagedStudentInput) => Promise<AdminUserProfile | null>;
  onDraftSubjectsChange: (subjects: string[]) => void;
  onSearchQueryChange: (query: string) => void;
  open: boolean;
  searchQuery: string;
  studentUsers: AdminUserProfile[];
}) {
  const { t } = useAppTranslation();
  const visibleStudents = filterScheduleStudents(studentUsers, searchQuery);
  const [managedStudentUsername, setManagedStudentUsername] = useState("");
  const [managedStudentFirstName, setManagedStudentFirstName] = useState("");
  const [managedStudentLastName, setManagedStudentLastName] = useState("");
  const [managedStudentEmail, setManagedStudentEmail] = useState("");
  const normalizedManagedStudentUsername = managedStudentUsername.trim().toLowerCase();
  const normalizedManagedStudentEmail = managedStudentEmail.trim().toLowerCase();
  const managedStudentUsernameInvalid = Boolean(
    normalizedManagedStudentUsername && !managedStudentUsernamePattern.test(normalizedManagedStudentUsername),
  );
  const managedStudentEmailInvalid = Boolean(
    normalizedManagedStudentEmail && !managedStudentEmailPattern.test(normalizedManagedStudentEmail),
  );
  const managedStudentInput = managedStudentInputFromDraft({
    username: managedStudentUsername,
    firstName: managedStudentFirstName,
    lastName: managedStudentLastName,
    email: managedStudentEmail,
  });
  const managedStudentSubmitDisabled = Boolean(disabled || managedStudentLoading || !managedStudentInput);

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

  async function submitManagedStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onCreateManagedStudent || managedStudentLoading) {
      return;
    }
    if (managedStudentSubmitDisabled) {
      return;
    }
    if (!managedStudentInput) {
      return;
    }
    const created = await onCreateManagedStudent(managedStudentInput);
    if (!created) {
      return;
    }
    onDraftSubjectsChange(selectedSubjectsAfterManagedStudentCreation(draftSubjects, created.subject));
    setManagedStudentUsername("");
    setManagedStudentFirstName("");
    setManagedStudentLastName("");
    setManagedStudentEmail("");
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

        {onCreateManagedStudent ? (
          <form
            autoComplete="off"
            className="playsay-schedule-managed-student-form"
            data-schedule-managed-student-form="true"
            onSubmit={(event) => void submitManagedStudent(event)}
          >
            <h4>{t("schedule.form.createManagedStudentTitle")}</h4>
            <div className="playsay-schedule-managed-student-fields">
              <label>
                <span>{t("schedule.form.createManagedStudentUsername")}</span>
                <input
                  aria-invalid={managedStudentUsernameInvalid}
                  autoComplete="off"
                  className="playsay-input"
                  disabled={disabled || managedStudentLoading}
                  maxLength={64}
                  minLength={3}
                  name="managedStudentUsername"
                  onChange={(event) => setManagedStudentUsername(event.target.value)}
                  pattern={"[A-Za-z0-9._\\-]{3,64}"}
                  required
                  spellCheck={false}
                  type="text"
                  value={managedStudentUsername}
                />
                {managedStudentUsernameInvalid ? (
                  <small className="playsay-field-error">{t("schedule.form.createManagedStudentUsernameInvalid")}</small>
                ) : (
                  <small>{t("schedule.form.createManagedStudentUsernameHint")}</small>
                )}
              </label>
              <label>
                <span>{t("schedule.form.createManagedStudentFirstName")}</span>
                <input
                  autoComplete="off"
                  className="playsay-input"
                  disabled={disabled || managedStudentLoading}
                  maxLength={120}
                  name="managedStudentFirstName"
                  onChange={(event) => setManagedStudentFirstName(event.target.value)}
                  required
                  type="text"
                  value={managedStudentFirstName}
                />
              </label>
              <label>
                <span>{t("schedule.form.createManagedStudentLastName")}</span>
                <input
                  autoComplete="off"
                  className="playsay-input"
                  disabled={disabled || managedStudentLoading}
                  maxLength={120}
                  name="managedStudentLastName"
                  onChange={(event) => setManagedStudentLastName(event.target.value)}
                  type="text"
                  value={managedStudentLastName}
                />
              </label>
              <label>
                <span>{t("schedule.form.createManagedStudentEmail")}</span>
                <input
                  aria-invalid={managedStudentEmailInvalid}
                  autoComplete="off"
                  className="playsay-input"
                  disabled={disabled || managedStudentLoading}
                  maxLength={320}
                  name="managedStudentEmail"
                  onChange={(event) => setManagedStudentEmail(event.target.value)}
                  spellCheck={false}
                  type="email"
                  value={managedStudentEmail}
                />
                {managedStudentEmailInvalid ? (
                  <small className="playsay-field-error">{t("schedule.form.createManagedStudentEmailInvalid")}</small>
                ) : null}
              </label>
            </div>
            <div className="playsay-schedule-managed-student-actions">
              {managedStudentMessage ? <p className="playsay-field-error" role="alert">{managedStudentMessage}</p> : null}
              <Button
                disabled={managedStudentSubmitDisabled}
                type="submit"
              >
                {managedStudentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {t("schedule.form.createManagedStudent")}
              </Button>
            </div>
          </form>
        ) : null}

        <div className="playsay-schedule-student-dialog-list">
          {visibleStudents.length === 0 ? (
            <div className="playsay-schedule-student-empty">
              {t("schedule.form.noStudentsFound")}
            </div>
          ) : visibleStudents.map((student) => {
            const label = studentLabel(student) ?? student.subject;
            const showUsername = Boolean(student.username && student.username !== label);
            return (
              <label className="playsay-schedule-student-option" key={student.subject}>
                <span className="playsay-schedule-student-option-identity min-w-0">
                  <span className="truncate">{label}</span>
                  {showUsername ? <small className="truncate">@{student.username}</small> : null}
                </span>
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
    [student.displayName, student.name, student.username, student.email, student.subject]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery))
  ));
}

function studentLabel(student: AdminUserProfile | undefined): string | null {
  return student?.displayName ?? student?.name ?? student?.username ?? student?.email ?? student?.subject ?? null;
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
