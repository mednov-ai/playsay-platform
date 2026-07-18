import { useState, type FormEvent, type ReactNode } from "react";
import { CalendarClock, Loader2, RefreshCw, UserMinus, UserPlus, UsersRound, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";
import { useTeacherManagementData } from "../api/useUserManagementData";
import type { TeacherDelegation, TeacherStudent } from "../api/userManagement";
import { DelegationWizard } from "./DelegationWizard";
import { LessonTranslationPermissionControl } from "./LessonTranslationPermissionControl";

type Section = "mine" | "received" | "granted";

export function TeacherStudentsPanel() {
  const { i18n, t } = useAppTranslation();
  const data = useTeacherManagementData();
  const [section, setSection] = useState<Section>("mine");
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const students = data.students.data ?? [];
  const mine = students.filter((item) => item.access === "PRIMARY_TEACHER");
  const receivedStudents = students.filter((item) => item.access === "ACTIVE_DELEGATE");
  const loading = data.students.isFetching || data.granted.isFetching || data.received.isFetching;
  const error = data.students.error ?? data.granted.error ?? data.received.error ?? data.attach.error ?? data.delegate.error;

  async function attach(event: FormEvent) {
    event.preventDefault();
    if (!identifier.trim()) return;
    setMessage(null);
    try {
      await data.attach.mutateAsync(identifier.trim());
      setIdentifier("");
      setMessage(t("userManagement.messages.studentAttached"));
    } catch {
      setMessage(t("userManagement.messages.actionFailed"));
    }
  }

  return (
    <section className="grid gap-5" aria-busy={loading}>
      <header className="rounded-3xl border border-primary/15 bg-[radial-gradient(circle_at_top_right,rgba(255,216,77,.24),transparent_38%),white] p-5 shadow-sm sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t("userManagement.teacher.eyebrow")}</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black">{t("userManagement.teacher.title")}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("userManagement.teacher.subtitle")}</p>
          </div>
          <Button onClick={() => void data.students.refetch()} type="button" variant="outline">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t("common.actions.refresh")}
          </Button>
        </div>
      </header>

      <nav aria-label={t("userManagement.teacher.sectionsAria")} className="flex flex-wrap gap-2">
        <SectionButton active={section === "mine"} label={t("userManagement.teacher.mine", { count: mine.length })} onClick={() => setSection("mine")} />
        <SectionButton active={section === "received"} label={t("userManagement.teacher.received", { count: receivedStudents.length })} onClick={() => setSection("received")} />
        <SectionButton active={section === "granted"} label={t("userManagement.teacher.granted", { count: data.granted.data?.length ?? 0 })} onClick={() => setSection("granted")} />
      </nav>

      {message ? <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm font-semibold">{message}</p> : null}
      {error ? <p className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm font-semibold text-destructive">{error instanceof Error ? error.message : t("userManagement.messages.loadFailed")}</p> : null}

      {section === "mine" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,.8fr)]">
          <div className="grid content-start gap-3">
            <form className="flex flex-col gap-2 rounded-2xl border border-border bg-white p-4 sm:flex-row" onSubmit={(event) => void attach(event)}>
              <label className="grid flex-1 gap-1 text-sm font-bold">
                {t("userManagement.fields.usernameOrEmail")}
                <input
                  aria-label={t("userManagement.fields.usernameOrEmail")}
                  className="playsay-input"
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder={t("userManagement.placeholders.exactIdentity")}
                  value={identifier}
                />
              </label>
              <Button className="self-end" disabled={data.attach.isPending || !identifier.trim()} type="submit">
                <UserPlus className="h-4 w-4" />{t("userManagement.actions.attach")}
              </Button>
            </form>
            <StudentList
              empty={t("userManagement.empty.myStudents")}
              onDetach={async (student) => {
                await data.detach.mutateAsync(student.student.subject);
              }}
              onTranslationPermission={(student, allowed) => data.translationPermission.mutateAsync({ allowed, subject: student.student.subject })}
              onTranslationPermissionError={() => setMessage(t("userManagement.messages.translationPermissionFailed"))}
              onTranslationPermissionSaved={() => setMessage(t("userManagement.messages.translationPermissionSaved"))}
              students={mine}
            />
          </div>
          <DelegationWizard
            admin={false}
            disabled={data.delegate.isPending}
            onSubmit={(input) => data.delegate.mutateAsync(input)}
            students={mine.map((item) => item.student)}
            teachers={data.directory.data ?? []}
          />
        </div>
      ) : null}

      {section === "received" ? (
        <StudentList
          empty={t("userManagement.empty.receivedStudents")}
          onTranslationPermission={(student, allowed) => data.translationPermission.mutateAsync({ allowed, subject: student.student.subject })}
          onTranslationPermissionError={() => setMessage(t("userManagement.messages.translationPermissionFailed"))}
          onTranslationPermissionSaved={() => setMessage(t("userManagement.messages.translationPermissionSaved"))}
          students={receivedStudents}
        />
      ) : null}

      {section === "granted" ? (
        <DelegationList
          delegations={data.granted.data ?? []}
          empty={t("userManagement.empty.delegations")}
          locale={i18n.language}
          onRevoke={(id) => data.revoke.mutateAsync(id)}
        />
      ) : null}
    </section>
  );
}

function StudentList({
  empty,
  onDetach,
  onTranslationPermission,
  onTranslationPermissionError,
  onTranslationPermissionSaved,
  students,
}: {
  empty: string;
  onDetach?: (student: TeacherStudent) => Promise<unknown>;
  onTranslationPermission: (student: TeacherStudent, allowed: boolean) => Promise<unknown>;
  onTranslationPermissionError: () => void;
  onTranslationPermissionSaved: () => void;
  students: TeacherStudent[];
}) {
  const { t } = useAppTranslation();
  if (students.length === 0) return <EmptyState icon={<UsersRound className="h-6 w-6" />} text={empty} />;
  return (
    <div className="grid gap-2">
      {students.map((item) => (
        <article className="grid items-center gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_minmax(16rem,.9fr)_auto]" key={item.student.subject}>
          <div className="min-w-0">
            <h3 className="truncate font-extrabold">{item.student.displayName ?? item.student.username ?? item.student.subject}</h3>
            <p className="truncate text-sm text-muted-foreground">{item.student.email ?? item.student.username ?? item.student.subject}</p>
            {item.student.activeDelegates.length > 0 ? <p className="mt-1 text-xs font-bold text-primary">{t("userManagement.student.delegateCount", { count: item.student.activeDelegates.length })}</p> : null}
          </div>
          <LessonTranslationPermissionControl
            allowed={item.student.lessonTranslationAllowed}
            onChange={(allowed) => onTranslationPermission(item, allowed)}
            onError={onTranslationPermissionError}
            onSaved={onTranslationPermissionSaved}
            studentName={item.student.displayName ?? item.student.username ?? item.student.subject}
          />
          {onDetach ? (
            <Button aria-label={t("userManagement.actions.detachStudent", { name: item.student.displayName ?? item.student.username })} className="h-9" onClick={() => void onDetach(item)} type="button" variant="outline">
              <UserMinus className="h-4 w-4" />{t("userManagement.actions.detach")}
            </Button>
          ) : <span className="rounded-lg bg-primary/10 px-2 py-1 text-xs font-bold text-primary">{t("userManagement.access.activeDelegate")}</span>}
        </article>
      ))}
    </div>
  );
}

export function DelegationList({ delegations, empty, locale, onRevoke }: {
  delegations: TeacherDelegation[];
  empty: string;
  locale: string;
  onRevoke: (id: string) => Promise<unknown>;
}) {
  const { t } = useAppTranslation();
  if (delegations.length === 0) return <EmptyState icon={<CalendarClock className="h-6 w-6" />} text={empty} />;
  return (
    <div className="grid gap-3">
      {delegations.map((delegation) => (
        <article className="grid gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm sm:grid-cols-[1fr_auto]" key={delegation.id}>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-extrabold">{delegation.delegateTeacher.displayName}</h3>
              <span className="rounded-lg bg-muted px-2 py-1 text-xs font-bold">{t(`userManagement.status.${delegation.status}`)}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("userManagement.delegation.range", {
                from: new Date(delegation.startsAt).toLocaleDateString(locale),
                to: new Date(new Date(delegation.endsAt).getTime() - 1).toLocaleDateString(locale),
              })}
            </p>
            <p className="mt-1 text-sm font-semibold">{t("userManagement.delegation.studentCount", { count: delegation.students.length })}</p>
          </div>
          {delegation.status === "ACTIVE" || delegation.status === "FUTURE" ? (
            <Button className="h-9" onClick={() => void onRevoke(delegation.id)} type="button" variant="outline">
              <X className="h-4 w-4" />{t("userManagement.actions.revoke")}
            </Button>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function SectionButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <Button aria-pressed={active} onClick={onClick} type="button" variant={active ? "default" : "outline"}>{label}</Button>;
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="grid min-h-32 place-items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-center text-sm font-semibold text-muted-foreground"><span className="text-primary">{icon}</span>{text}</div>;
}
