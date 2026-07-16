import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, BookOpen, CalendarClock, Check, Loader2, Plus, Users, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  DURATION_PRESET_MINUTES,
  defaultScheduleForm,
  isWeeklyRecurrenceValid,
  localScheduleDateTimeToIso,
  localScheduleEndIso,
  scheduleRecurrenceInput,
  scheduleWeekdays,
  selectedParticipantSubjects,
  type CourseLessonOption,
  type ScheduleFormState,
} from "../../../entities/schedule/model";
import type {
  AdminUserProfile,
  LessonMaterial,
  ManagedStudentInput,
  ScheduledLesson,
  ScheduledLessonInput,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { FormField } from "../../../shared/ui/FormField";
import { ScheduleStudentPickerDialog } from "./ScheduleCreateForm";

const MaterialPlayPreviewDialog = lazy(() => (
  import("../../materials/ui/MaterialPlayPreviewDialog").then((module) => ({ default: module.MaterialPlayPreviewDialog }))
));

type WizardStep = 0 | 1 | 2 | 3;

export function LessonAssignmentWizard({
  disabled,
  lessonOptions,
  managedStudentMessage,
  materials,
  onClose,
  onCreate,
  onCreateManagedStudent,
  onOpenMaterials,
  onPrepare,
  open,
  studentUsers,
}: {
  disabled: boolean;
  lessonOptions: CourseLessonOption[];
  managedStudentMessage: string | null;
  materials: LessonMaterial[];
  onClose: () => void;
  onCreate: (input: ScheduledLessonInput) => Promise<ScheduledLesson | null | void> | void;
  onCreateManagedStudent: (input: ManagedStudentInput) => Promise<AdminUserProfile | null>;
  onOpenMaterials: () => void;
  onPrepare: (lessonId: string) => void;
  open: boolean;
  studentUsers: AdminUserProfile[];
}) {
  const { t } = useAppTranslation();
  const [step, setStep] = useState<WizardStep>(0);
  const [form, setForm] = useState<ScheduleFormState>(() => defaultScheduleForm(""));
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [draftStudentSubjects, setDraftStudentSubjects] = useState<string[]>([]);
  const [previewMaterial, setPreviewMaterial] = useState<LessonMaterial | null>(null);
  const [createdLesson, setCreatedLesson] = useState<ScheduledLesson | null>(null);
  const activeMaterials = materials.filter((material) => material.status !== "ARCHIVED");
  const selectedSubjects = selectedParticipantSubjects(form.participantSubjects);
  const selectedStudents = selectedSubjects.map((subject) => studentUsers.find((student) => student.subject === subject));
  const selectedMaterial = activeMaterials.find((material) => material.id === form.materialId) ?? null;
  const canContinue = step === 0
    ? selectedSubjects.length > 0
    : step === 1
      ? Boolean(form.scheduledDate && form.scheduledTime && isWeeklyRecurrenceValid(form))
      : true;

  useEffect(() => {
    if (!open) {
      setStep(0);
      setForm(defaultScheduleForm(""));
      setCreatedLesson(null);
      setPreviewMaterial(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !studentPickerOpen && !previewMaterial) {
        onClose();
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open, previewMaterial, studentPickerOpen]);

  if (!open) {
    return null;
  }

  function updateField<Key extends keyof ScheduleFormState>(field: Key, value: ScheduleFormState[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function openStudentPicker() {
    setDraftStudentSubjects(selectedSubjects);
    setStudentSearchQuery("");
    setStudentPickerOpen(true);
  }

  function applyStudentPicker() {
    updateField("participantSubjects", draftStudentSubjects.join(", "));
    setStudentPickerOpen(false);
  }

  function selectTemplate(lessonTemplateId: string) {
    const option = lessonOptions.find((item) => item.id === lessonTemplateId);
    setForm((current) => ({
      ...current,
      lessonTemplateId,
      materialId: option?.materialId ?? "",
      inheritTemplateMaterial: false,
      defaultParallelMaterialId: option?.materialId ?? "",
    }));
  }

  function toggleWeekday(weekday: string) {
    setForm((current) => ({
      ...current,
      recurrenceWeekdays: current.recurrenceWeekdays.includes(weekday)
        ? current.recurrenceWeekdays.filter((item) => item !== weekday)
        : [...current.recurrenceWeekdays, weekday],
      recurrenceWeekdayTimes: {
        ...current.recurrenceWeekdayTimes,
        [weekday]: current.recurrenceWeekdayTimes[weekday] || current.scheduledTime,
      },
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 3) {
      setStep((step + 1) as WizardStep);
      return;
    }
    const participantAssignments = form.workMode === "PARALLEL"
      ? buildParticipantAssignments(selectedSubjects, form.defaultParallelMaterialId || form.materialId, form.participantMaterialIds)
      : [];
    const created = await onCreate({
      lessonTemplateId: form.lessonTemplateId || null,
      materialId: form.workMode === "PARALLEL" ? null : form.materialId || null,
      inheritTemplateMaterial: false,
      scheduledStart: localScheduleDateTimeToIso(form.scheduledDate, form.scheduledTime),
      scheduledEnd: localScheduleEndIso(form.scheduledDate, form.scheduledTime, form.durationMinutes),
      status: "SCHEDULED",
      type: selectedSubjects.length > 1 ? "GROUP" : form.type,
      workMode: form.workMode,
      participantSubjects: selectedSubjects,
      participantAssignments,
      recurrence: scheduleRecurrenceInput(form),
    });
    if (created) {
      setCreatedLesson(created);
    }
  }

  return (
    <div className="playsay-schedule-wizard-backdrop">
      <form
        aria-labelledby="lesson-assignment-wizard-title"
        aria-modal="true"
        className="playsay-schedule-wizard"
        onSubmit={(event) => void submit(event)}
        role="dialog"
      >
        <header className="playsay-schedule-wizard-head">
          <div>
            <span>{t("schedule.wizard.eyebrow")}</span>
            <h2 id="lesson-assignment-wizard-title">
              {createdLesson ? t("schedule.wizard.successTitle") : t("schedule.wizard.title")}
            </h2>
            <p>{createdLesson ? t("schedule.wizard.successSubtitle") : t("schedule.wizard.subtitle")}</p>
          </div>
          <Button aria-label={t("schedule.wizard.close")} onClick={onClose} type="button" variant="outline">
            <X className="h-4 w-4" />
          </Button>
        </header>

        {createdLesson ? (
          <div className="playsay-schedule-wizard-success">
            <div><Check className="h-8 w-8" /></div>
            <strong>{createdLesson.lessonTitle ?? createdLesson.courseTitle ?? t("schedule.lessonFallbackTitle")}</strong>
            <span>{formatStudentNames(selectedStudents, t("schedule.form.noStudentsSelected"))}</span>
            <span>{formatDateTimeSummary(form.scheduledDate, form.scheduledTime)}</span>
            <div>
              <Button onClick={() => onPrepare(createdLesson.id)} type="button">
                <BookOpen className="h-4 w-4" />
                {t("schedule.wizard.openPreparation")}
              </Button>
              <Button onClick={onClose} type="button" variant="outline">
                {t("schedule.wizard.backToSchedule")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <nav aria-label={t("schedule.wizard.progressAria")} className="playsay-schedule-wizard-progress">
              {["students", "time", "material", "review"].map((key, index) => (
                <button
                  aria-current={step === index ? "step" : undefined}
                  data-active={step === index ? "true" : "false"}
                  disabled={index > step}
                  key={key}
                  onClick={() => setStep(index as WizardStep)}
                  type="button"
                >
                  <span>{index + 1}</span>
                  {t(`schedule.wizard.steps.${key}`)}
                </button>
              ))}
            </nav>

            <div className="playsay-schedule-wizard-body">
              {step === 0 ? (
                <section className="playsay-schedule-wizard-step">
                  <Users className="playsay-schedule-wizard-icon" />
                  <h3>{t("schedule.wizard.studentsTitle")}</h3>
                  <p>{t("schedule.wizard.studentsSubtitle")}</p>
                  <button className="playsay-schedule-choice" onClick={openStudentPicker} type="button">
                    <span>{selectedSubjects.length ? formatStudentNames(selectedStudents, "") : t("schedule.form.chooseStudents")}</span>
                    <strong>{selectedSubjects.length ? t("schedule.form.selectedStudents", { count: selectedSubjects.length }) : t("schedule.wizard.chooseStudentsHint")}</strong>
                  </button>
                </section>
              ) : null}

              {step === 1 ? (
                <section className="playsay-schedule-wizard-step">
                  <CalendarClock className="playsay-schedule-wizard-icon" />
                  <h3>{t("schedule.wizard.timeTitle")}</h3>
                  <p>{t("schedule.wizard.timeSubtitle")}</p>
                  <div className="playsay-schedule-wizard-fields">
                    <FormField label={t("schedule.form.date")}>
                      <input className="playsay-input" onChange={(event) => updateField("scheduledDate", event.target.value)} required type="date" value={form.scheduledDate} />
                    </FormField>
                    <FormField label={t("schedule.form.time")}>
                      <input className="playsay-input" onChange={(event) => updateField("scheduledTime", event.target.value)} required type="time" value={form.scheduledTime} />
                    </FormField>
                  </div>
                  <div className="playsay-schedule-duration-presets">
                    {DURATION_PRESET_MINUTES.map((duration) => (
                      <button
                        aria-pressed={form.durationMinutes === String(duration)}
                        className="playsay-schedule-duration-preset"
                        data-selected={form.durationMinutes === String(duration) ? "true" : "false"}
                        key={duration}
                        onClick={() => updateField("durationMinutes", String(duration))}
                        type="button"
                      >
                        {t("schedule.duration.minutes", { count: duration })}
                      </button>
                    ))}
                  </div>
                  <details className="playsay-schedule-advanced">
                    <summary>{t("schedule.wizard.repeatSettings")}</summary>
                    <div className="playsay-schedule-wizard-advanced-grid">
                      <select className="playsay-input" onChange={(event) => updateField("recurrenceMode", event.target.value as ScheduleFormState["recurrenceMode"])} value={form.recurrenceMode}>
                        <option value="NONE">{t("schedule.recurrence.none")}</option>
                        <option value="WEEKLY">{t("schedule.recurrence.weekly")}</option>
                      </select>
                      {form.recurrenceMode === "WEEKLY" ? (
                        <>
                          <input className="playsay-input" max={52} min={1} onChange={(event) => updateField("recurrenceCount", event.target.value)} type="number" value={form.recurrenceCount} />
                          <div className="playsay-schedule-weekdays">
                            {scheduleWeekdays.map((weekday) => (
                              <button
                                aria-pressed={form.recurrenceWeekdays.includes(weekday)}
                                data-selected={form.recurrenceWeekdays.includes(weekday) ? "true" : "false"}
                                key={weekday}
                                onClick={() => toggleWeekday(weekday)}
                                type="button"
                              >
                                {t(`schedule.weekdaysShort.${weekday}`)}
                              </button>
                            ))}
                          </div>
                        </>
                      ) : null}
                    </div>
                  </details>
                </section>
              ) : null}

              {step === 2 ? (
                <section className="playsay-schedule-wizard-step">
                  <BookOpen className="playsay-schedule-wizard-icon" />
                  <h3>{t("schedule.wizard.materialTitle")}</h3>
                  <p>{t("schedule.wizard.materialSubtitle")}</p>
                  {activeMaterials.length ? (
                    <div className="playsay-schedule-material-grid">
                      <div className="playsay-schedule-material-option playsay-schedule-material-option--single" data-selected={!form.materialId ? "true" : "false"}>
                        <button
                          aria-pressed={!form.materialId}
                          onClick={() => setForm((current) => ({ ...current, materialId: "", inheritTemplateMaterial: false, defaultParallelMaterialId: "" }))}
                          type="button"
                        >
                          {!form.materialId ? <Check aria-hidden="true" className="playsay-schedule-material-check" /> : null}
                          <strong>{t("schedule.form.noMaterial")}</strong>
                          <span>{t("schedule.wizard.chooseLater")}</span>
                        </button>
                      </div>
                      {activeMaterials.map((material) => (
                        <div className="playsay-schedule-material-option" data-selected={form.materialId === material.id ? "true" : "false"} key={material.id}>
                          <button
                            aria-pressed={form.materialId === material.id}
                            onClick={() => setForm((current) => ({ ...current, materialId: material.id, inheritTemplateMaterial: false, defaultParallelMaterialId: material.id }))}
                            type="button"
                          >
                            {form.materialId === material.id ? <Check aria-hidden="true" className="playsay-schedule-material-check" /> : null}
                            <strong>{material.title}</strong>
                            <span>{material.cefrLevel} · {t("schedule.wizard.blocks", { count: material.blockCount })}</span>
                          </button>
                          <button onClick={() => setPreviewMaterial(material)} type="button">{t("schedule.wizard.preview")}</button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="playsay-schedule-wizard-empty">
                      <p>{t("schedule.wizard.noMaterials")}</p>
                      <Button onClick={onOpenMaterials} type="button" variant="outline"><Plus className="h-4 w-4" />{t("schedule.wizard.createMaterial")}</Button>
                    </div>
                  )}
                  <details className="playsay-schedule-advanced">
                    <summary>{t("schedule.wizard.lessonSettings")}</summary>
                    <div className="playsay-schedule-wizard-advanced-grid">
                      <FormField label={t("schedule.form.lessonTemplate")}>
                        <select className="playsay-input" onChange={(event) => selectTemplate(event.target.value)} value={form.lessonTemplateId}>
                          <option value="">{t("schedule.form.noTemplate")}</option>
                          {lessonOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                        </select>
                      </FormField>
                      {selectedSubjects.length > 1 ? (
                        <FormField label={t("schedule.form.workMode")}>
                          <select className="playsay-input" onChange={(event) => updateField("workMode", event.target.value as ScheduleFormState["workMode"])} value={form.workMode}>
                            <option value="SHARED">{t("schedule.workMode.shared")}</option>
                            <option value="PARALLEL">{t("schedule.workMode.parallel")}</option>
                          </select>
                        </FormField>
                      ) : null}
                    </div>
                  </details>
                </section>
              ) : null}

              {step === 3 ? (
                <section className="playsay-schedule-wizard-step playsay-schedule-wizard-review">
                  <Check className="playsay-schedule-wizard-icon" />
                  <h3>{t("schedule.wizard.reviewTitle")}</h3>
                  <p>{t("schedule.wizard.reviewSubtitle")}</p>
                  <dl>
                    <div><dt>{t("schedule.form.students")}</dt><dd>{formatStudentNames(selectedStudents, t("schedule.form.noStudentsSelected"))}</dd></div>
                    <div><dt>{t("schedule.wizard.dateAndTime")}</dt><dd>{formatDateTimeSummary(form.scheduledDate, form.scheduledTime)} · {t("schedule.duration.minutes", { count: Number(form.durationMinutes) })}</dd></div>
                    <div><dt>{t("schedule.form.directMaterial")}</dt><dd>{selectedMaterial?.title ?? t("schedule.form.noMaterial")}</dd></div>
                    <div><dt>{t("schedule.form.format")}</dt><dd>{selectedSubjects.length > 1 ? t("schedule.lessonType.group") : t("schedule.lessonType.individual")}</dd></div>
                  </dl>
                </section>
              ) : null}
            </div>

            <footer className="playsay-schedule-wizard-footer">
              <Button disabled={step === 0 || disabled} onClick={() => setStep((step - 1) as WizardStep)} type="button" variant="outline">
                <ArrowLeft className="h-4 w-4" />{t("schedule.wizard.back")}
              </Button>
              <Button disabled={!canContinue || disabled} type="submit">
                {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : step === 3 ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                {step === 3 ? t("schedule.wizard.assign") : t("schedule.wizard.next")}
              </Button>
            </footer>
          </>
        )}
      </form>

      <ScheduleStudentPickerDialog
        disabled={disabled}
        draftSubjects={draftStudentSubjects}
        managedStudentLoading={disabled}
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
      {previewMaterial ? (
        <Suspense fallback={null}>
          <MaterialPlayPreviewDialog material={previewMaterial} onClose={() => setPreviewMaterial(null)} open />
        </Suspense>
      ) : null}
    </div>
  );
}

function formatStudentNames(students: Array<AdminUserProfile | undefined>, fallback: string): string {
  const names = students.map((student) => student?.displayName ?? student?.name ?? student?.username ?? student?.email).filter(Boolean);
  return names.length ? names.join(", ") : fallback;
}

function formatDateTimeSummary(date: string, time: string): string {
  return `${date} · ${time}`;
}

function buildParticipantAssignments(
  participantSubjects: string[],
  defaultMaterialId: string,
  participantMaterialIds: Record<string, string>,
): ScheduledLessonInput["participantAssignments"] {
  if (!defaultMaterialId) {
    return [];
  }
  const byMaterial = new Map<string, string[]>();
  participantSubjects.forEach((subject) => {
    const materialId = participantMaterialIds[subject] || defaultMaterialId;
    byMaterial.set(materialId, [...(byMaterial.get(materialId) ?? []), subject]);
  });
  return Array.from(byMaterial, ([materialId, subjects]) => ({ materialId, participantSubjects: subjects }));
}
