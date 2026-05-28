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
import type { AdminUserProfile, ScheduledLessonInput } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

export function ScheduleCreateForm({
  disabled,
  lessonOptions,
  onCreate,
  studentUsers,
}: {
  disabled: boolean;
  lessonOptions: Array<{ id: string; label: string }>;
  onCreate: (input: ScheduledLessonInput) => void;
  studentUsers: AdminUserProfile[];
}) {
  const { t } = useAppTranslation();
  const [form, setForm] = useState<ScheduleFormState>(() => defaultScheduleForm(lessonOptions[0]?.id ?? ""));

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
      return { ...current, participantSubjects: next.join(", ") };
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({
      lessonTemplateId: form.lessonTemplateId || null,
      materialId: null,
      scheduledStart: localDateTimeToIso(form.scheduledStart),
      scheduledEnd: localDateTimeToIso(form.scheduledEnd),
      status: "SCHEDULED",
      type: form.type,
      participantSubjects: form.participantSubjects
        .split(",")
        .map((subject) => subject.trim())
        .filter(Boolean),
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
