import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, RotateCcw, Save, ShieldCheck, User } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { FormField } from "../../../shared/ui/FormField";
import type {
  AdminUserProfile,
  AppUserProfile,
  MeProfile,
  UpdateUserProfileInput,
} from "../../../shared/api/playsay";
import { normalizeLanguage, useAppTranslation } from "../../../shared/i18n";
import { LanguageSwitcher } from "../../../shared/i18n/ui/LanguageSwitcher";

export type SessionStatus = "checking" | "anonymous" | "authenticated" | "loggingOut" | "error";

type ProfileFormState = {
  birthDate: string;
  countryCode: string;
  displayName: string;
  timezone: string;
  learningGoal: string;
};

export function ProfileAccountPanel({
  adminLoading,
  adminMessage,
  adminUsers,
  appProfile,
  error,
  isAdmin,
  isAuthenticated,
  onRefreshAdminUsers,
  onResetProfile,
  onSaveProfile,
  profile,
  profileMessage,
  profileSaving,
  status,
}: {
  adminLoading: boolean;
  adminMessage: string | null;
  adminUsers: AdminUserProfile[];
  appProfile: AppUserProfile | null;
  error: string | null;
  isAdmin: boolean;
  isAuthenticated: boolean;
  onRefreshAdminUsers: () => void;
  onResetProfile: () => void;
  onSaveProfile: (input: UpdateUserProfileInput) => Promise<void>;
  profile: MeProfile | null;
  profileMessage: string | null;
  profileSaving: boolean;
  status: SessionStatus;
}) {
  const { t } = useAppTranslation();

  return (
    <section className="rounded-[1.5rem] border border-border bg-white/90 p-5 shadow-[0_22px_70px_rgba(35,25,15,0.08)]">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-extrabold">{t("profile.sections.user")}</h2>
          </div>
          <IdentityPanel error={error} profile={profile} status={status} />
        </section>

        <section className="min-w-0">
          <div className="mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-extrabold">{t("profile.sections.account")}</h2>
          </div>
          <ProfileEditor
            disabled={!isAuthenticated || profileSaving}
            message={profileMessage}
            onReset={onResetProfile}
            onSave={onSaveProfile}
            profile={appProfile}
            saving={profileSaving}
          />
        </section>
      </div>

      {isAdmin ? (
        <div className="mt-5">
          <AdminUsersPanel
            loading={adminLoading}
            message={adminMessage}
            onRefresh={onRefreshAdminUsers}
            users={adminUsers}
          />
        </div>
      ) : null}
    </section>
  );
}

function ProfileEditor({
  disabled,
  message,
  onReset,
  onSave,
  profile,
  saving,
}: {
  disabled: boolean;
  message: string | null;
  onReset: () => void;
  onSave: (input: UpdateUserProfileInput) => Promise<void>;
  profile: AppUserProfile | null;
  saving: boolean;
}) {
  const { i18n, t } = useAppTranslation();
  const [form, setForm] = useState<ProfileFormState>({
    birthDate: "",
    countryCode: "",
    displayName: "",
    timezone: "",
    learningGoal: "",
  });

  useEffect(() => {
    setForm({
      birthDate: profile?.birthDate ?? "",
      countryCode: profile?.countryCode ?? "",
      displayName: profile?.displayName ?? "",
      timezone: profile?.timezone ?? "",
      learningGoal: profile?.learningGoal ?? "",
    });
  }, [profile]);

  function updateField(field: keyof ProfileFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      birthDate: form.birthDate || null,
      countryCode: form.countryCode,
      displayName: form.displayName,
      locale: normalizeLanguage(i18n.resolvedLanguage ?? i18n.language),
      timezone: form.timezone,
      learningGoal: form.learningGoal,
    });
  }

  return (
    <form className="grid gap-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <FormField label={t("profile.fields.name")}>
          <input
            className="playsay-input"
            disabled={disabled}
            maxLength={120}
            onChange={(event) => updateField("displayName", event.target.value)}
            value={form.displayName}
          />
        </FormField>
        <FormField label={t("profile.fields.language")}>
          <LanguageSwitcher
            className="playsay-input flex items-center gap-2 px-3"
            disabled={disabled}
            onSaveProfile={onSave}
            profile={profile}
          />
        </FormField>
      </div>

      <FormField label={t("profile.fields.country")}>
        <select
          className="playsay-input"
          disabled={disabled}
          onChange={(event) => updateField("countryCode", event.target.value)}
          value={form.countryCode}
        >
          <option value="">{t("profile.country.unspecified")}</option>
          <option value="RU">{t("profile.country.russia")}</option>
        </select>
      </FormField>

      <FormField label={t("profile.fields.birthDate")}>
        <input
          className="playsay-input"
          disabled={disabled}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(event) => updateField("birthDate", event.target.value)}
          type="date"
          value={form.birthDate}
        />
      </FormField>

      <FormField label={t("profile.fields.timezone")}>
        <input
          className="playsay-input"
          disabled={disabled}
          maxLength={64}
          onChange={(event) => updateField("timezone", event.target.value)}
          placeholder="Europe/Moscow"
          value={form.timezone}
        />
      </FormField>

      <FormField label={t("profile.fields.learningGoal")}>
        <textarea
          className="playsay-input min-h-24 resize-none py-3"
          disabled={disabled}
          maxLength={500}
          onChange={(event) => updateField("learningGoal", event.target.value)}
          value={form.learningGoal}
        />
      </FormField>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="text-xs font-semibold text-muted-foreground">
          {message ??
            (profile
              ? t("profile.status.updatedAt", { date: new Date(profile.updatedAt).toLocaleString() })
              : t("profile.status.editLoginRequired"))}
        </div>
        <div className="flex gap-2">
          <Button disabled={disabled || !profile} onClick={onReset} type="button" variant="outline">
            <RotateCcw className="h-4 w-4" />
            {t("common.actions.reset")}
          </Button>
          <Button disabled={disabled} type="submit">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("common.actions.save")}
          </Button>
        </div>
      </div>
    </form>
  );
}

function IdentityPanel({
  error,
  profile,
  status,
}: {
  error: string | null;
  profile: MeProfile | null;
  status: SessionStatus;
}) {
  const { t } = useAppTranslation();

  if (status === "checking") {
    return (
      <div className="mt-4 flex min-h-28 items-center gap-3 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        {t("profile.status.checkingSession")}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mt-4 flex min-h-28 items-center gap-3 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-primary" />
        {error ?? t("profile.status.sessionError")}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mt-4 flex min-h-28 items-center gap-3 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
        <User className="h-4 w-4 text-primary" />
        {t("profile.status.loginRequired")}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold">{profile.name ?? profile.username ?? profile.subject}</div>
          <div className="mt-1 break-all text-xs font-semibold text-muted-foreground">{profile.email ?? profile.subject}</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {profile.roles.map((role) => (
          <span className="rounded-full border border-primary/20 bg-white px-3 py-1 text-xs font-extrabold text-primary" key={role}>
            {role}
          </span>
        ))}
      </div>
    </div>
  );
}

function AdminUsersPanel({
  loading,
  message,
  onRefresh,
  users,
}: {
  loading: boolean;
  message: string | null;
  onRefresh: () => void;
  users: AdminUserProfile[];
}) {
  const { t } = useAppTranslation();

  return (
    <section className="rounded-[1.5rem] border border-border bg-white/90 p-5 shadow-[0_22px_70px_rgba(35,25,15,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-extrabold">{t("profile.sections.adminUsers")}</h2>
        </div>
        <Button disabled={loading} onClick={onRefresh} type="button" variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t("common.actions.refresh")}
        </Button>
      </div>

      {message ? (
        <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
          {message}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        {users.length === 0 ? (
          <div className="rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
            {t("profile.status.noAdminProfiles")}
          </div>
        ) : (
          users.map((user) => <AdminUserRow key={user.subject} user={user} />)
        )}
      </div>
    </section>
  );
}

function AdminUserRow({ user }: { user: AdminUserProfile }) {
  const { t } = useAppTranslation();

  return (
    <article className="rounded-2xl border border-border bg-muted/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold">
            {user.displayName ?? user.name ?? user.username ?? user.subject}
          </div>
          <div className="mt-1 break-all text-xs font-semibold text-muted-foreground">
            {user.email ?? user.username ?? user.subject}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2 py-1 text-xs font-extrabold text-primary">
          {user.roles[0] ?? t("profile.status.noRole")}
        </span>
      </div>
      {user.learningGoal ? (
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{user.learningGoal}</p>
      ) : null}
    </article>
  );
}
