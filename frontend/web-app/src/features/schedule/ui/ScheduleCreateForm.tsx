import { useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { FormField } from "../../../shared/ui/FormField";
import {
  defaultScheduleForm,
  localDateTimeToIso,
  selectedParticipantSubjects,
  type ScheduleFormState,
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
  lessonOptions: Array<{ id: string; label: string }>;
  materials: LessonMaterial[];
  onCreate: (input: ScheduledLessonInput) => void;
  studentUsers: AdminUserProfile[];
}) {
  const { t } = useAppTranslation();
  const [form, setForm] = useState<ScheduleFormState>(() => defaultScheduleForm(lessonOptions[0]?.id ?? ""));
  const materialOptions = materials.filter((material) => material.status !== "ARCHIVED");
  const selectedSubjects = selectedParticipantSubjects(form.participantSubjects);
  const showParallelAssignments = form.workMode === "PARALLEL" && selectedSubjects.length > 1;

  useEffect(() => {
    setForm((current) => (
      current.lessonTemplateId || lessonOptions.length === 0
        ? current
        : { ...current, lessonTemplateId: lessonOptions[0].id }
    ));
  }, [lessonOptions]);

  function updateField<Key extends keyof ScheduleFormState>(field: Key, value: ScheduleFormState[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleParticipant(subject: string) {
    setForm((current) => {
      const selected = selectedParticipantSubjects(current.participantSubjects);
      const next = selected.includes(subject)
        ? selected.filter((item) => item !== subject)
        : [...selected, subject];
      const nextMaterialIds = { ...current.participantMaterialIds };
      if (!next.includes(subject)) {
        delete nextMaterialIds[subject];
      }
      return { ...current, participantMaterialIds: nextMaterialIds, participantSubjects: next.join(", ") };
    });
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
      scheduledStart: localDateTimeToIso(form.scheduledStart),
      scheduledEnd: localDateTimeToIso(form.scheduledEnd),
      status: "SCHEDULED",
      type: form.type,
      workMode: showParallelAssignments ? "PARALLEL" : "SHARED",
      participantSubjects,
      participantAssignments: showParallelAssignments ? participantAssignments : [],
    });
  }

  return (
    <form className="grid gap-3 rounded-2xl border border-border bg-muted/50 p-3" onSubmit={submit}>
      <FormField label={t("schedule.form.lessonTemplate")}>
        <select
          className="playsay-input"
          disabled={disabled}
          onChange={(event) => updateField("lessonTemplateId", event.target.value)}
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
        <FormField label={t("schedule.form.workMode")}>
          <select
            className="playsay-input"
            disabled={disabled}
            onChange={(event) => updateField("workMode", event.target.value as ScheduleFormState["workMode"])}
            value={form.workMode}
          >
            <option value="SHARED">{t("schedule.workMode.shared")}</option>
            <option value="PARALLEL">{t("schedule.workMode.parallel")}</option>
          </select>
        </FormField>
        <FormField label={showParallelAssignments ? t("schedule.form.parallelDefaultMaterial") : t("schedule.form.directMaterial")}>
          <select
            className="playsay-input"
            disabled={disabled || materialOptions.length === 0}
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
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("schedule.form.start")}>
          <input
            className="playsay-input"
            disabled={disabled}
            onChange={(event) => updateField("scheduledStart", event.target.value)}
            required
            type="datetime-local"
            value={form.scheduledStart}
          />
        </FormField>
        <FormField label={t("schedule.form.end")}>
          <input
            className="playsay-input"
            disabled={disabled}
            onChange={(event) => updateField("scheduledEnd", event.target.value)}
            required
            type="datetime-local"
            value={form.scheduledEnd}
          />
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

      <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
        <FormField label={t("schedule.form.format")}>
          <select
            className="playsay-input"
            disabled={disabled}
            onChange={(event) => updateField("type", event.target.value as ScheduleFormState["type"])}
            value={form.type}
          >
            <option value="GROUP">{t("schedule.lessonType.group")}</option>
            <option value="INDIVIDUAL">{t("schedule.lessonType.individual")}</option>
          </select>
        </FormField>
        <FormField label={t("schedule.form.students")}>
          {studentUsers.length === 0 ? (
            <input
              className="playsay-input"
              disabled={disabled}
              onChange={(event) => updateField("participantSubjects", event.target.value)}
              placeholder={t("schedule.form.studentsPlaceholder")}
              value={form.participantSubjects}
            />
          ) : (
            <div className="grid gap-2 rounded-2xl border border-border bg-background p-3">
              {studentUsers.map((student) => {
                const selected = selectedParticipantSubjects(form.participantSubjects).includes(student.subject);
                return (
                  <label className="flex items-center justify-between gap-3 text-sm font-extrabold" key={student.subject}>
                    <span className="min-w-0 truncate">
                      {student.displayName ?? student.name ?? student.username ?? student.subject}
                    </span>
                    <input
                      checked={selected}
                      disabled={disabled}
                      onChange={() => toggleParticipant(student.subject)}
                      type="checkbox"
                    />
                  </label>
                );
              })}
            </div>
          )}
        </FormField>
      </div>

      <div className="flex justify-end">
        <Button disabled={disabled} type="submit">
          <Plus className="h-4 w-4" />
          {t("schedule.form.addLesson")}
        </Button>
      </div>
    </form>
  );
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
