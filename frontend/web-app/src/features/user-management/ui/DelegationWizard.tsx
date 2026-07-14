import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";
import type {
  CreateDelegationInput,
  TeacherDirectoryEntry,
  UserManagementUser,
} from "../api/userManagement";

type Props = {
  admin: boolean;
  disabled?: boolean;
  onSubmit: (input: CreateDelegationInput) => Promise<unknown>;
  primaryTeachers?: TeacherDirectoryEntry[];
  students: UserManagementUser[];
  teachers: TeacherDirectoryEntry[];
};

export function DelegationWizard({ admin, disabled, onSubmit, primaryTeachers = [], students, teachers }: Props) {
  const { t } = useAppTranslation();
  const today = localDateValue(new Date());
  const [step, setStep] = useState(0);
  const [primaryTeacherSubject, setPrimaryTeacherSubject] = useState("");
  const [delegates, setDelegates] = useState<string[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState(today);
  const [endsAt, setEndsAt] = useState(today);
  const steps = admin ? ["primary", "delegates", "students", "period", "confirm"] : ["delegates", "students", "period", "confirm"];
  const current = steps[step];
  const availableStudents = useMemo(
    () => admin && primaryTeacherSubject
      ? students.filter((student) => student.primaryTeacher?.subject === primaryTeacherSubject)
      : students,
    [admin, primaryTeacherSubject, students],
  );
  const availableTeachers = teachers.filter((teacher) => teacher.subject !== primaryTeacherSubject);

  const canContinue = current === "primary" ? Boolean(primaryTeacherSubject)
    : current === "delegates" ? delegates.length > 0
      : current === "students" ? selectedStudents.length > 0
        : current === "period" ? Boolean(startsAt && endsAt && endsAt >= startsAt)
          : true;

  function toggle(value: string, selected: string[], update: (next: string[]) => void) {
    update(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (current !== "confirm") {
      if (canContinue) setStep((value) => value + 1);
      return;
    }
    await onSubmit({
      ...(admin ? { primaryTeacherSubject } : {}),
      delegateTeacherSubjects: delegates,
      studentSubjects: selectedStudents,
      startsAt,
      endsAt,
    });
    setStep(0);
    setDelegates([]);
    setSelectedStudents([]);
  }

  return (
    <form className="grid gap-4 rounded-2xl border border-border bg-white/90 p-4 shadow-sm" onSubmit={(event) => void submit(event)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{t("userManagement.delegation.eyebrow")}</p>
          <h3 className="mt-1 text-lg font-extrabold">{t("userManagement.delegation.title")}</h3>
        </div>
        <span className="rounded-lg bg-muted px-2 py-1 text-xs font-bold text-muted-foreground">
          {t("userManagement.delegation.step", { current: step + 1, total: steps.length })}
        </span>
      </div>

      {current === "primary" ? (
        <Field label={t("userManagement.fields.primaryTeacher")}>
          <select className="playsay-input" onChange={(event) => { setPrimaryTeacherSubject(event.target.value); setDelegates([]); setSelectedStudents([]); }} value={primaryTeacherSubject}>
            <option value="">{t("userManagement.placeholders.selectTeacher")}</option>
            {primaryTeachers.map((teacher) => <option key={teacher.subject} value={teacher.subject}>{teacher.displayName}</option>)}
          </select>
        </Field>
      ) : null}

      {current === "delegates" ? (
        <ChoiceList
          empty={t("userManagement.empty.teachers")}
          items={availableTeachers.map((teacher) => ({ id: teacher.subject, label: teacher.displayName }))}
          label={t("userManagement.delegation.chooseDelegates")}
          onToggle={(id) => toggle(id, delegates, setDelegates)}
          selected={delegates}
        />
      ) : null}

      {current === "students" ? (
        <div className="grid gap-3">
          <ChoiceList
            empty={t("userManagement.empty.students")}
            items={availableStudents.map((student) => ({ id: student.subject, label: student.displayName ?? student.username ?? student.subject }))}
            label={t("userManagement.delegation.chooseStudents")}
            onToggle={(id) => toggle(id, selectedStudents, setSelectedStudents)}
            selected={selectedStudents}
          />
          {availableStudents.length > 0 ? (
            <Button onClick={() => setSelectedStudents(availableStudents.map((student) => student.subject))} type="button" variant="outline">
              {t("userManagement.actions.selectAll")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {current === "period" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("userManagement.fields.startsAt")}>
            <input className="playsay-input" min={today} onChange={(event) => setStartsAt(event.target.value)} type="date" value={startsAt} />
          </Field>
          <Field label={t("userManagement.fields.endsAt")}>
            <input className="playsay-input" min={startsAt} onChange={(event) => setEndsAt(event.target.value)} type="date" value={endsAt} />
          </Field>
          <p className="text-sm text-muted-foreground sm:col-span-2">{t("userManagement.delegation.periodHint")}</p>
        </div>
      ) : null}

      {current === "confirm" ? (
        <div className="grid gap-2 rounded-xl bg-muted/55 p-3 text-sm">
          {admin ? <Summary label={t("userManagement.fields.primaryTeacher")} value={primaryTeachers.find((item) => item.subject === primaryTeacherSubject)?.displayName ?? primaryTeacherSubject} /> : null}
          <Summary label={t("userManagement.fields.delegates")} value={String(delegates.length)} />
          <Summary label={t("userManagement.fields.students")} value={String(selectedStudents.length)} />
          <Summary label={t("userManagement.fields.period")} value={`${startsAt} — ${endsAt}`} />
        </div>
      ) : null}

      <div className="flex justify-between gap-2">
        <Button disabled={step === 0 || disabled} onClick={() => setStep((value) => value - 1)} type="button" variant="outline">
          <ArrowLeft className="h-4 w-4" />{t("userManagement.actions.back")}
        </Button>
        <Button disabled={!canContinue || disabled} type="submit">
          {current === "confirm" ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          {current === "confirm" ? t("userManagement.actions.createDelegation") : t("userManagement.actions.next")}
        </Button>
      </div>
    </form>
  );
}

function ChoiceList({ empty, items, label, onToggle, selected }: {
  empty: string;
  items: Array<{ id: string; label: string }>;
  label: string;
  onToggle: (id: string) => void;
  selected: string[];
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-extrabold">{label}</legend>
      {items.length === 0 ? <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">{empty}</p> : items.map((item) => (
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background p-3 hover:border-primary/45" key={item.id}>
          <input checked={selected.includes(item.id)} onChange={() => onToggle(item.id)} type="checkbox" />
          <span className="font-semibold">{item.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className="grid gap-1.5 text-sm font-bold">{label}{children}</label>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{label}</span><strong>{value}</strong></div>;
}

function localDateValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
