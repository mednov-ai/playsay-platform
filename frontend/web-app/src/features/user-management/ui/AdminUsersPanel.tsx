import { useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Plus, RefreshCw, Save, Search, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";
import { useAdminManagementData } from "../api/useUserManagementData";
import type { CreateUserInput, TeacherDirectoryEntry, UserManagementUser } from "../api/userManagement";
import { ApiError } from "../../../shared/api/errors";
import { DelegationWizard } from "./DelegationWizard";
import { DelegationList } from "./TeacherStudentsPanel";
import { LessonTranslationPermissionControl } from "./LessonTranslationPermissionControl";

const roleNames = ["STUDENT", "TEACHER", "ADMIN"] as const;

export function AdminUsersPanel() {
  const { i18n, t } = useAppTranslation();
  const [searchDraft, setSearchDraft] = useState("");
  const [filters, setFilters] = useState({ role: "", search: "", status: "ACTIVE" });
  const [message, setMessage] = useState<string | null>(null);
  const data = useAdminManagementData(filters);
  const users = data.users.data ?? [];
  const teachers = data.directory.data ?? [];
  const students = data.students.data ?? [];
  const loading = data.users.isFetching || data.students.isFetching || data.directory.isFetching;
  const error = data.users.error ?? data.students.error ?? data.directory.error;

  function search(event: FormEvent) {
    event.preventDefault();
    setFilters((current) => ({ ...current, search: searchDraft.trim() }));
  }

  async function perform(action: () => Promise<unknown>, success: string) {
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch (caught) {
      setMessage(t(userManagementErrorKey(caught)));
    }
  }

  return (
    <section className="grid gap-5" aria-busy={loading}>
      <header className="rounded-3xl border border-primary/15 bg-[radial-gradient(circle_at_top_right,rgba(116,219,190,.2),transparent_38%),white] p-5 shadow-sm sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t("userManagement.admin.eyebrow")}</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-black"><ShieldCheck className="h-6 w-6 text-primary" />{t("userManagement.admin.title")}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("userManagement.admin.subtitle")}</p>
          </div>
          <Button onClick={() => void data.users.refetch()} type="button" variant="outline">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{t("common.actions.refresh")}
          </Button>
        </div>
      </header>

      <form className="grid gap-2 rounded-2xl border border-border bg-white p-4 sm:grid-cols-[1fr_auto_auto_auto]" onSubmit={search}>
        <label className="grid gap-1 text-sm font-bold">
          {t("userManagement.fields.search")}
          <input className="playsay-input" onChange={(event) => setSearchDraft(event.target.value)} placeholder={t("userManagement.placeholders.search")} value={searchDraft} />
        </label>
        <Filter label={t("userManagement.fields.role")} onChange={(role) => setFilters((current) => ({ ...current, role }))} value={filters.role}>
          <option value="">{t("userManagement.filters.allRoles")}</option>
          {roleNames.map((role) => <option key={role} value={role}>{t(`userManagement.roles.${role}`)}</option>)}
        </Filter>
        <Filter label={t("userManagement.fields.status")} onChange={(status) => setFilters((current) => ({ ...current, status }))} value={filters.status}>
          <option value="">{t("userManagement.filters.allStatuses")}</option>
          <option value="ACTIVE">{t("userManagement.status.ACTIVE")}</option>
          <option value="DELETED">{t("userManagement.status.DELETED")}</option>
        </Filter>
        <Button className="self-end" type="submit"><Search className="h-4 w-4" />{t("userManagement.actions.search")}</Button>
      </form>

      {message ? <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm font-semibold" role="status">{message}</p> : null}
      {error ? <p className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm font-semibold text-destructive" role="alert">{error instanceof Error ? error.message : t("userManagement.messages.loadFailed")}</p> : null}

      <details className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-extrabold"><UserPlus className="h-5 w-5 text-primary" />{t("userManagement.admin.createUser")}</summary>
        <CreateUserForm
          disabled={data.addUser.isPending}
          onSubmit={(input) => perform(() => data.addUser.mutateAsync(input), t("userManagement.messages.userCreated"))}
          teachers={teachers}
        />
      </details>

      <div className="grid gap-3">
        {users.length === 0 ? <Empty>{t("userManagement.empty.users")}</Empty> : users.map((user) => (
          <UserCard
            key={user.subject}
            onDelete={(replacementTeacherSubject) => perform(
              () => data.removeUser.mutateAsync({ replacementTeacherSubject, subject: user.subject }),
              t("userManagement.messages.deletionCompleted"),
            )}
            onPrimaryTeacher={(teacherSubject) => perform(
              () => data.assignTeacher.mutateAsync({ studentSubject: user.subject, teacherSubject }),
              t("userManagement.messages.teacherUpdated"),
            )}
            onRoles={(roles, replacementTeacherSubject) => perform(
              () => data.changeRoles.mutateAsync({ replacementTeacherSubject, roles, subject: user.subject }),
              t("userManagement.messages.rolesUpdated"),
            )}
            onTranslationPermission={(allowed) => data.translationPermission.mutateAsync({ allowed, subject: user.subject })}
            onTranslationPermissionError={() => setMessage(t("userManagement.messages.translationPermissionFailed"))}
            onTranslationPermissionSaved={() => setMessage(t("userManagement.messages.translationPermissionSaved"))}
            teachers={teachers}
            user={user}
            deleting={data.removeUser.isPending && data.removeUser.variables?.subject === user.subject}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
        <DelegationWizard
          admin
          disabled={data.delegate.isPending}
          onSubmit={(input) => perform(() => data.delegate.mutateAsync(input), t("userManagement.messages.delegationCreated"))}
          primaryTeachers={teachers}
          students={students}
          teachers={teachers}
        />
        <div className="grid content-start gap-3">
          <h3 className="text-lg font-extrabold">{t("userManagement.admin.delegations")}</h3>
          <DelegationList
            delegations={data.delegations.data ?? []}
            empty={t("userManagement.empty.delegations")}
            locale={i18n.language}
            onRevoke={(id) => data.revoke.mutateAsync(id)}
          />
        </div>
      </div>
    </section>
  );
}

function UserCard({
  deleting,
  onDelete,
  onPrimaryTeacher,
  onRoles,
  onTranslationPermission,
  onTranslationPermissionError,
  onTranslationPermissionSaved,
  teachers,
  user,
}: {
  deleting: boolean;
  onDelete: (replacementTeacherSubject?: string) => Promise<unknown>;
  onPrimaryTeacher: (teacherSubject: string) => Promise<unknown>;
  onRoles: (roles: string[], replacementTeacherSubject?: string) => Promise<unknown>;
  onTranslationPermission: (allowed: boolean) => Promise<unknown>;
  onTranslationPermissionError: () => void;
  onTranslationPermissionSaved: () => void;
  teachers: TeacherDirectoryEntry[];
  user: UserManagementUser;
}) {
  const { t } = useAppTranslation();
  const [roles, setRoles] = useState(user.roles);
  const [replacement, setReplacement] = useState("");
  const student = roles.includes("STUDENT");
  const storedStudent = user.roles.includes("STUDENT");
  const active = user.status === "ACTIVE";

  function toggleRole(role: string) {
    if (role === "STUDENT") {
      setRoles(roles.includes(role) ? [] : [role]);
      return;
    }
    const staffRoles = roles.filter((item) => item !== "STUDENT");
    setRoles(staffRoles.includes(role) ? staffRoles.filter((item) => item !== role) : [...staffRoles, role]);
  }

  return (
    <article className="grid gap-4 rounded-2xl border border-border bg-white p-4 shadow-sm lg:grid-cols-[minmax(12rem,1fr)_minmax(20rem,1.5fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-extrabold">{user.displayName ?? user.username ?? user.subject}</h3>
          <span className="rounded-lg bg-muted px-2 py-1 text-xs font-bold">{t(`userManagement.status.${user.status}`)}</span>
        </div>
        <p className="truncate text-sm text-muted-foreground">{user.email ?? user.username ?? user.subject}</p>
        {user.activeDelegates.length > 0 ? <p className="mt-1 text-xs font-bold text-primary">{t("userManagement.student.delegateCount", { count: user.activeDelegates.length })}</p> : null}
      </div>
      <div className="grid gap-3">
        <fieldset className="flex flex-wrap gap-3" disabled={!active}>
          <legend className="sr-only">{t("userManagement.fields.roles")}</legend>
          {roleNames.map((role) => (
            <label className="flex items-center gap-1.5 text-sm font-semibold" key={role}>
              <input checked={roles.includes(role)} onChange={() => toggleRole(role)} type="checkbox" />{t(`userManagement.roles.${role}`)}
            </label>
          ))}
        </fieldset>
        {student ? (
          <label className="grid gap-1 text-sm font-bold">
            {t("userManagement.fields.primaryTeacher")}
            <select className="playsay-input" disabled={!active} onChange={(event) => void onPrimaryTeacher(event.target.value)} value={user.primaryTeacher?.subject ?? ""}>
              <option value="">{t("userManagement.placeholders.noTeacher")}</option>
              {teachers.map((teacher) => <option key={teacher.subject} value={teacher.subject}>{teacher.displayName}</option>)}
            </select>
          </label>
        ) : (
          <label className="grid gap-1 text-sm font-bold">
            {t("userManagement.fields.replacementTeacher")}
            <select className="playsay-input" disabled={!active} onChange={(event) => setReplacement(event.target.value)} value={replacement}>
              <option value="">{t("userManagement.placeholders.selectIfRequired")}</option>
              {teachers.filter((teacher) => teacher.subject !== user.subject).map((teacher) => <option key={teacher.subject} value={teacher.subject}>{teacher.displayName}</option>)}
            </select>
          </label>
        )}
        {storedStudent ? (
          <LessonTranslationPermissionControl
            allowed={user.lessonTranslationAllowed}
            disabled={!active}
            onChange={onTranslationPermission}
            onError={onTranslationPermissionError}
            onSaved={onTranslationPermissionSaved}
            studentName={user.displayName ?? user.username ?? user.subject}
          />
        ) : null}
      </div>
      <div className="flex items-end gap-2 lg:flex-col lg:justify-end">
        <Button className="h-9" disabled={!active || roles.length === 0} onClick={() => void onRoles(roles, replacement || undefined)} type="button">
          <Save className="h-4 w-4" />{t("common.actions.save")}
        </Button>
        <Button
          disabled={!active || deleting}
          onClick={() => {
            if (window.confirm(t("userManagement.confirm.delete", { name: user.displayName ?? user.username ?? user.subject }))) {
              void onDelete(replacement || undefined);
            }
          }}
          className="h-9"
          type="button"
          variant="outline"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {t(deleting ? "userManagement.actions.deleting" : "userManagement.actions.delete")}
        </Button>
      </div>
    </article>
  );
}

export function userManagementErrorKey(caught: unknown): string {
  if (!(caught instanceof ApiError)) return "userManagement.messages.actionFailed";
  return knownUserManagementErrors[caught.errorCode] ?? "userManagement.messages.actionFailed";
}

const knownUserManagementErrors: Record<string, string> = {
  ADMIN_ROLE_REQUIRED: "userManagement.errors.adminRequired",
  DELEGATION_TEACHER_INVALID: "userManagement.errors.teacherInvalid",
  LAST_ADMIN_REQUIRED: "userManagement.errors.lastAdmin",
  USER_DELETE_FAILED: "userManagement.errors.deletionFailed",
  USER_DELETE_IN_PROGRESS_LESSON: "userManagement.errors.inProgressLesson",
  USER_DELETE_REPLACEMENT_REQUIRED: "userManagement.errors.replacementRequired",
  USER_DELETE_TIMEOUT: "userManagement.errors.deletionStillRunning",
  USER_NOT_FOUND: "userManagement.errors.userNotFound",
  USER_SELF_ADMIN_CHANGE_FORBIDDEN: "userManagement.errors.selfAdminChange",
};

function CreateUserForm({ disabled, onSubmit, teachers }: {
  disabled: boolean;
  onSubmit: (input: CreateUserInput) => Promise<unknown>;
  teachers: TeacherDirectoryEntry[];
}) {
  const { t } = useAppTranslation();
  const [form, setForm] = useState<CreateUserInput>({ firstName: "", roles: ["STUDENT"], username: "" });
  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSubmit(form);
    setForm({ firstName: "", roles: ["STUDENT"], username: "" });
  }
  const student = form.roles.includes("STUDENT");
  return (
    <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
      <TextField label={t("userManagement.fields.username")} onChange={(username) => setForm((value) => ({ ...value, username }))} required value={form.username} />
      <TextField label={t("userManagement.fields.email")} onChange={(email) => setForm((value) => ({ ...value, email }))} required={!student} type="email" value={form.email ?? ""} />
      <TextField label={t("userManagement.fields.firstName")} onChange={(firstName) => setForm((value) => ({ ...value, firstName }))} required value={form.firstName} />
      <TextField label={t("userManagement.fields.lastName")} onChange={(lastName) => setForm((value) => ({ ...value, lastName }))} value={form.lastName ?? ""} />
      <label className="grid gap-1 text-sm font-bold">
        {t("userManagement.fields.accountType")}
        <select className="playsay-input" onChange={(event) => setForm((value) => ({ ...value, roles: event.target.value.split("+") }))} value={form.roles.join("+")}>
          <option value="STUDENT">{t("userManagement.roles.STUDENT")}</option>
          <option value="TEACHER">{t("userManagement.roles.TEACHER")}</option>
          <option value="ADMIN">{t("userManagement.roles.ADMIN")}</option>
          <option value="ADMIN+TEACHER">{t("userManagement.roles.ADMIN_TEACHER")}</option>
        </select>
      </label>
      {student ? (
        <label className="grid gap-1 text-sm font-bold">
          {t("userManagement.fields.primaryTeacher")}
          <select className="playsay-input" onChange={(event) => setForm((value) => ({ ...value, primaryTeacherSubject: event.target.value || undefined }))} value={form.primaryTeacherSubject ?? ""}>
            <option value="">{t("userManagement.placeholders.noTeacher")}</option>
            {teachers.map((teacher) => <option key={teacher.subject} value={teacher.subject}>{teacher.displayName}</option>)}
          </select>
        </label>
      ) : null}
      <Button className="sm:col-span-2 sm:justify-self-start" disabled={disabled || !form.username || !form.firstName} type="submit">
        <Plus className="h-4 w-4" />{t("userManagement.actions.create")}
      </Button>
    </form>
  );
}

function TextField({ label, onChange, required, type = "text", value }: { label: string; onChange: (value: string) => void; required?: boolean; type?: string; value: string }) {
  return <label className="grid gap-1 text-sm font-bold">{label}<input className="playsay-input" onChange={(event) => onChange(event.target.value)} required={required} type={type} value={value} /></label>;
}

function Filter({ children, label, onChange, value }: { children: ReactNode; label: string; onChange: (value: string) => void; value: string }) {
  return <label className="grid gap-1 text-sm font-bold">{label}<select className="playsay-input" onChange={(event) => onChange(event.target.value)} value={value}>{children}</select></label>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm font-semibold text-muted-foreground">{children}</div>;
}
