import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Gamepad2,
  Loader2,
  LogIn,
  LogOut,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  User,
  Video,
  type LucideIcon,
} from "lucide-react";
import {
  buildLogoutUrl,
  clearTokens,
  completeLogin,
  fetchMe,
  fetchUserProfile,
  isAuthCallback,
  readTokens,
  resetUserProfile,
  saveUserProfile,
  startLogin,
  type AppUserProfile,
  type MeProfile,
  type UpdateUserProfileInput,
} from "./auth";
import { Button } from "./components/ui/button";

type SessionStatus = "checking" | "anonymous" | "authenticated" | "error";

type ProfileFormState = {
  displayName: string;
  locale: string;
  timezone: string;
  learningGoal: string;
};

export function App() {
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [appProfile, setAppProfile] = useState<AppUserProfile | null>(null);
  const [status, setStatus] = useState<SessionStatus>("checking");
  const [error, setError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const currentUrl = new URL(window.location.href);
        if (isAuthCallback(currentUrl)) {
          await completeLogin(currentUrl);
          window.history.replaceState({}, document.title, "/");
        }

        if (!readTokens()) {
          if (!cancelled) {
            setStatus("anonymous");
          }
          return;
        }

        const me = await fetchMe();
        const currentAppProfile = await fetchUserProfile();
        if (!cancelled) {
          setProfile(me);
          setAppProfile(currentAppProfile);
          setStatus("authenticated");
        }
      } catch (caught) {
        clearTokens();
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Auth failed.");
          setStatus("error");
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const isAuthenticated = status === "authenticated" && profile !== null;

  function logout() {
    const logoutUrl = buildLogoutUrl();
    clearTokens();
    window.location.assign(logoutUrl);
  }

  async function saveProfile(input: UpdateUserProfileInput) {
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      const updated = await saveUserProfile(input);
      setAppProfile(updated);
      setProfileMessage("Профиль сохранён");
    } catch (caught) {
      setProfileMessage(caught instanceof Error ? caught.message : "Не удалось сохранить профиль");
    } finally {
      setProfileSaving(false);
    }
  }

  async function resetProfile() {
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      await resetUserProfile();
      const recreated = await fetchUserProfile();
      setAppProfile(recreated);
      setProfileMessage("Профиль сброшен");
    } catch (caught) {
      setProfileMessage(caught instanceof Error ? caught.message : "Не удалось сбросить профиль");
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-7 px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between gap-4">
          <BrandMark />
          <div className="flex items-center gap-3">
            <SessionBadge status={status} />
            {isAuthenticated ? (
              <Button variant="outline" onClick={logout}>
                <LogOut className="h-4 w-4" />
                Выйти
              </Button>
            ) : (
              <Button onClick={() => void startLogin()} disabled={status === "checking"}>
                {status === "checking" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                Войти
              </Button>
            )}
          </div>
        </header>

        <div className="grid flex-1 gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="flex flex-col gap-5">
            <div className="relative overflow-hidden rounded-[1.75rem] border border-border bg-white/85 p-6 shadow-[0_22px_70px_rgba(35,25,15,0.10)] sm:p-8">
              <div className="absolute -right-9 top-10 hidden h-24 w-24 rounded-full bg-[#ffe07a] sm:block" />
              <div className="absolute -bottom-10 right-20 hidden h-28 w-28 rounded-full bg-primary sm:block" />
              <p className="relative text-sm font-black uppercase text-primary">Online classroom</p>
              <h1 className="relative mt-4 max-w-2xl text-5xl font-black leading-[0.98] tracking-normal sm:text-6xl">
                Английский начинается с живого общения
                <span className="ml-3 inline-block h-3 w-14 rounded-full bg-primary align-middle -rotate-3" />
              </h1>
              <p className="relative mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
                Заготовка кабинета уже следует стилю сайта: тёплый фон, оранжевые действия,
                мягкие блоки и понятный маршрут от входа до занятия.
              </p>
              <div className="relative mt-7 flex flex-wrap gap-3">
                <AccentChip>Play</AccentChip>
                <AccentChip tone="mint">I can speak</AccentChip>
                <AccentChip tone="yellow">Hello!</AccentChip>
              </div>
              <div className="relative mt-8 flex flex-wrap gap-3">
                <Button disabled={!isAuthenticated} className="min-w-44">
                  <Video className="h-4 w-4" />
                  Начать урок
                </Button>
                <Button variant="outline" disabled={!isAuthenticated}>
                  <BookOpen className="h-4 w-4" />
                  Открыть задание
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FeatureCard icon={ShieldCheck} title="Безопасный вход" text="Keycloak и роли Play&Say." />
              <FeatureCard icon={Gamepad2} title="Игровой формат" text="Кабинет готовится под живые занятия." />
              <FeatureCard icon={Sparkles} title="Фирменный стиль" text="Цвета и ритм как на сайте." />
            </div>

            <section className="rounded-[1.25rem] border border-border bg-white/80 p-4">
              <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-extrabold">Черновик задания</h2>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                  Sprint 1
                </span>
              </div>
              <textarea
                className="mt-4 min-h-36 w-full resize-none rounded-2xl border border-border bg-muted/70 p-4 text-sm outline-none ring-primary/30 focus:ring-2"
                defaultValue="Hello! My name is..."
                disabled={!isAuthenticated}
              />
            </section>
          </section>

          <aside className="flex flex-col gap-4">
            <section className="rounded-[1.5rem] border border-border bg-white/90 p-5 shadow-[0_22px_70px_rgba(35,25,15,0.08)]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-extrabold">Пользователь</h2>
              </div>
              <IdentityPanel error={error} profile={profile} status={status} />
            </section>

            <section className="rounded-[1.5rem] border border-border bg-white/90 p-5 shadow-[0_22px_70px_rgba(35,25,15,0.08)]">
              <div className="mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-extrabold">Профиль Play&Say</h2>
              </div>
              <ProfileEditor
                disabled={!isAuthenticated || profileSaving}
                message={profileMessage}
                onReset={() => void resetProfile()}
                onSave={(input) => void saveProfile(input)}
                profile={appProfile}
                saving={profileSaving}
              />
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-16 w-16 place-items-center rounded-[1.1rem] bg-white text-center text-[1.35rem] font-black leading-[0.86] text-primary shadow-[0_16px_38px_rgba(255,92,0,0.14)] -rotate-3">
        Play
        <br />
        &Say
      </div>
      <div>
        <div className="text-sm font-black uppercase text-primary">Play&Say</div>
        <div className="text-xs font-bold text-muted-foreground">english studio</div>
      </div>
    </div>
  );
}

function SessionBadge({ status }: { status: SessionStatus }) {
  const label = {
    checking: "Проверяем сессию",
    anonymous: "Гость",
    authenticated: "В системе",
    error: "Ошибка входа",
  }[status];

  return (
    <span className="hidden rounded-full border border-border bg-white/80 px-3 py-2 text-xs font-extrabold text-muted-foreground sm:inline-flex">
      {label}
    </span>
  );
}

function AccentChip({
  children,
  tone = "white",
}: {
  children: string;
  tone?: "white" | "mint" | "yellow";
}) {
  const toneClass = {
    white: "bg-white",
    mint: "bg-[#dff8ee]",
    yellow: "bg-[#ffe07a]",
  }[tone];

  return (
    <span className={`rounded-full border-2 border-primary/15 px-4 py-2 text-sm font-black ${toneClass}`}>
      {children}
    </span>
  );
}

function FeatureCard({
  icon: Icon,
  text,
  title,
}: {
  icon: LucideIcon;
  text: string;
  title: string;
}) {
  return (
    <article className="rounded-[1.25rem] border border-border bg-white/80 p-4">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-extrabold">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
    </article>
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
  onSave: (input: UpdateUserProfileInput) => void;
  profile: AppUserProfile | null;
  saving: boolean;
}) {
  const [form, setForm] = useState<ProfileFormState>({
    displayName: "",
    locale: "",
    timezone: "",
    learningGoal: "",
  });

  useEffect(() => {
    setForm({
      displayName: profile?.displayName ?? "",
      locale: profile?.locale ?? "",
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
      displayName: form.displayName,
      locale: form.locale,
      timezone: form.timezone,
      learningGoal: form.learningGoal,
    });
  }

  return (
    <form className="grid gap-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <ProfileField label="Имя">
          <input
            className="playsay-input"
            disabled={disabled}
            maxLength={120}
            onChange={(event) => updateField("displayName", event.target.value)}
            value={form.displayName}
          />
        </ProfileField>
        <ProfileField label="Язык">
          <input
            className="playsay-input"
            disabled={disabled}
            maxLength={16}
            onChange={(event) => updateField("locale", event.target.value)}
            placeholder="en"
            value={form.locale}
          />
        </ProfileField>
      </div>

      <ProfileField label="Часовой пояс">
        <input
          className="playsay-input"
          disabled={disabled}
          maxLength={64}
          onChange={(event) => updateField("timezone", event.target.value)}
          placeholder="Europe/Moscow"
          value={form.timezone}
        />
      </ProfileField>

      <ProfileField label="Цель обучения">
        <textarea
          className="playsay-input min-h-24 resize-none py-3"
          disabled={disabled}
          maxLength={500}
          onChange={(event) => updateField("learningGoal", event.target.value)}
          value={form.learningGoal}
        />
      </ProfileField>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="text-xs font-semibold text-muted-foreground">
          {message ?? (profile ? `Обновлено ${new Date(profile.updatedAt).toLocaleString()}` : "Войдите, чтобы редактировать")}
        </div>
        <div className="flex gap-2">
          <Button disabled={disabled || !profile} onClick={onReset} type="button" variant="outline">
            <RotateCcw className="h-4 w-4" />
            Сбросить
          </Button>
          <Button disabled={disabled} type="submit">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Сохранить
          </Button>
        </div>
      </div>
    </form>
  );
}

function ProfileField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="grid gap-1 text-xs font-extrabold text-muted-foreground">
      {label}
      {children}
    </label>
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
  if (status === "checking") {
    return (
      <div className="mt-4 flex min-h-28 items-center gap-3 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Проверяем сессию
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mt-4 flex min-h-28 items-center gap-3 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-primary" />
        {error ?? "Ошибка сессии"}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mt-4 flex min-h-28 items-center gap-3 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
        <User className="h-4 w-4 text-primary" />
        Войдите, чтобы открыть кабинет
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
