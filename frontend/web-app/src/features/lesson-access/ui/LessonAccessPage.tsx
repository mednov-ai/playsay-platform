import { Clock3, KeyRound, Loader2, Mail, Users } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useAppTheme } from "../../../app/AppProviders";
import { Button } from "../../../components/ui/button";
import {
  getLessonAccessStatus,
  requestLessonEmailCode,
  requestLessonLobby,
  resumeRememberedLessonAccess,
  startLessonAccess,
  verifyLessonEmailCode,
  type LessonAccessAttempt,
} from "../../../shared/api/lessonAccess";
import { authConfig, buildLogoutUrl, clearTokens, readTokens, startSilentLogin } from "../../../shared/auth/oidc";
import { useAppTranslation } from "../../../shared/i18n";
import { LanguageSwitcher } from "../../../shared/i18n/ui/LanguageSwitcher";
import { ThemeToggle } from "../../../shared/theme/ThemeToggle";
import { BrandMark } from "../../../shared/ui/BrandMark";
import { FormField } from "../../../shared/ui/FormField";
import { accountLabelFromIdToken, lessonTokenFromHash, stepForStatus, type LessonEntryStep } from "../model/state";

type AttemptBinding = { id: string; secret: string };

export function LessonAccessPage({ lessonId }: { lessonId: string }) {
  const { t, i18n } = useAppTranslation();
  const theme = useAppTheme();
  const started = useRef(false);
  const [attempt, setAttempt] = useState<AttemptBinding | null>(null);
  const [step, setStep] = useState<LessonEntryStep>("starting");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [displayLabel, setDisplayLabel] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showLobby, setShowLobby] = useState(false);
  const [activeAccount, setActiveAccount] = useState<string | null>(() => accountLabelFromIdToken(readTokens()?.idToken));

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fragmentToken = tokenFromFragment();
    const pendingTokenKey = `honey.lesson-access.token:${lessonId}`;
    const silentAttemptKey = `honey.lesson-access.silent:${lessonId}`;
    if (fragmentToken) window.sessionStorage.setItem(pendingTokenKey, fragmentToken);
    clearFragment();
    const token = fragmentToken ?? window.sessionStorage.getItem(pendingTokenKey);
    if (!token) {
      setStep("error");
      return;
    }
    if (!readTokens() && window.sessionStorage.getItem(silentAttemptKey) !== "done") {
      window.sessionStorage.setItem(silentAttemptKey, "done");
      void startSilentLogin(authConfig, `/lesson-access/${encodeURIComponent(lessonId)}`);
      return;
    }
    window.sessionStorage.removeItem(silentAttemptKey);
    void startLessonAccess(lessonId, token)
      .then(async (result) => {
        if (!result.attemptSecret) throw new Error("attempt secret missing");
        const binding = { id: result.attemptId, secret: result.attemptSecret };
        setAttempt(binding);
        if (readTokens()) {
          setActiveAccount(accountLabelFromIdToken(readTokens()?.idToken));
          try {
            const remembered = await resumeRememberedLessonAccess(lessonId, binding.id, binding.secret);
            if (remembered.status === "AUTHENTICATED_READY") window.sessionStorage.removeItem(pendingTokenKey);
            acceptResult(remembered, setStep);
            return;
          } catch {
            // The active account is not assigned; email or Lobby remains available.
          }
        }
        acceptResult(result, setStep);
      })
      .catch(() => setStep("error"));
  }, [lessonId]);

  useEffect(() => {
    function restartForNewFragment() {
      const token = tokenFromFragment();
      if (!token) return;
      window.sessionStorage.setItem(`honey.lesson-access.token:${lessonId}`, token);
      clearFragment();
      window.location.reload();
    }
    window.addEventListener("hashchange", restartForNewFragment);
    return () => window.removeEventListener("hashchange", restartForNewFragment);
  }, [lessonId]);

  useEffect(() => {
    if (step !== "waiting" || !attempt) return;
    const timer = window.setInterval(() => {
      void getLessonAccessStatus(lessonId, attempt.id, attempt.secret)
        .then((result) => acceptResult(result, setStep))
        .catch(() => setStep("error"));
    }, 3000);
    return () => window.clearInterval(timer);
  }, [attempt, lessonId, step]);

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    if (!attempt) return;
    setBusy(true);
    try {
      const result = await requestLessonEmailCode(lessonId, attempt.id, attempt.secret, email, i18n.language);
      window.sessionStorage.removeItem(`honey.lesson-access.token:${lessonId}`);
      setStep(stepForStatus(result.status));
    } catch {
      setStep("error");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (!attempt) return;
    setBusy(true);
    try {
      acceptResult(await verifyLessonEmailCode(lessonId, attempt.id, attempt.secret, code, rememberMe), setStep);
    } catch {
      setStep("error");
    } finally {
      setBusy(false);
    }
  }

  async function submitLobby(event: FormEvent) {
    event.preventDefault();
    if (!attempt) return;
    setBusy(true);
    try {
      const result = await requestLessonLobby(lessonId, attempt.id, attempt.secret, displayLabel);
      window.sessionStorage.removeItem(`honey.lesson-access.token:${lessonId}`);
      setStep(stepForStatus(result.status));
    } catch {
      setStep("error");
    } finally {
      setBusy(false);
    }
  }

  function useAnotherAccount() {
    const logoutUrl = new URL(buildLogoutUrl(authConfig));
    logoutUrl.searchParams.set("post_logout_redirect_uri", `${window.location.origin}/lesson-access/${encodeURIComponent(lessonId)}`);
    clearTokens();
    window.location.assign(logoutUrl.toString());
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-5 py-6 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <BrandMark />
          <div className="flex items-center gap-2">
            <LanguageSwitcher disabled={busy} />
            <ThemeToggle mode={theme.mode} onModeChange={theme.setMode} resolvedTheme={theme.resolvedTheme} />
          </div>
        </header>
        <section className="grid flex-1 content-center">
          <div className="grid gap-5 rounded-[1.5rem] border border-border bg-background/90 p-5 shadow-sm sm:p-7">
            <div className="flex items-center gap-3 border-b border-border pb-5">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
                {step === "waiting" ? <Clock3 className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
              </span>
              <div>
                <h1 className="text-2xl font-extrabold">{t("registration.lessonAccess.title")}</h1>
                <p className="text-sm font-semibold text-muted-foreground">{t("registration.lessonAccess.subtitle")}</p>
              </div>
            </div>

            {activeAccount ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted/50 p-3 text-sm">
                <span>{t("registration.lessonAccess.activeAccount", { account: activeAccount })}</span>
                <Button disabled={busy} onClick={useAnotherAccount} type="button" variant="outline">
                  {t("registration.lessonAccess.notMe")}
                </Button>
              </div>
            ) : null}

            {step === "starting" ? <Status icon={<Loader2 className="h-4 w-4 animate-spin" />} text={t("registration.lessonAccess.starting")} /> : null}
            {step === "waiting" ? <Status icon={<Clock3 className="h-4 w-4" />} text={t("registration.lessonAccess.waiting")} /> : null}
            {step === "denied" ? <Status text={t("registration.lessonAccess.denied")} /> : null}
            {step === "closed" ? <Status text={t("registration.lessonAccess.closed")} /> : null}
            {step === "error" ? <Status text={t("registration.lessonAccess.error")} /> : null}

            {step === "choose" && !showLobby ? (
              <form className="grid gap-4" onSubmit={submitEmail}>
                <FormField label={t("registration.lessonAccess.emailLabel")}>
                  <input className={inputClass} autoComplete="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                </FormField>
                <Button disabled={busy} type="submit"><Mail className="h-4 w-4" />{t("registration.lessonAccess.sendCode")}</Button>
                <Button disabled={busy} onClick={() => setShowLobby(true)} type="button" variant="outline">
                  <Users className="h-4 w-4" />{t("registration.lessonAccess.noEmail")}
                </Button>
              </form>
            ) : null}

            {step === "choose" && showLobby ? (
              <form className="grid gap-4" onSubmit={submitLobby}>
                <FormField label={t("registration.lessonAccess.lobbyLabel")}>
                  <input className={inputClass} maxLength={120} required value={displayLabel} onChange={(event) => setDisplayLabel(event.target.value)} />
                </FormField>
                <p className="text-sm text-muted-foreground">{t("registration.lessonAccess.lobbyPrivacy")}</p>
                <Button disabled={busy} type="submit">{t("registration.lessonAccess.askTeacher")}</Button>
                <Button disabled={busy} onClick={() => setShowLobby(false)} type="button" variant="outline">{t("registration.lessonAccess.useEmail")}</Button>
              </form>
            ) : null}

            {step === "email-code" ? (
              <form className="grid gap-4" onSubmit={submitCode}>
                <Status text={t("registration.lessonAccess.codeSent")} />
                <FormField label={t("registration.lessonAccess.codeLabel")}>
                  <input className={inputClass} autoComplete="one-time-code" inputMode="numeric" maxLength={12} minLength={6} required value={code} onChange={(event) => setCode(event.target.value)} />
                </FormField>
                <label className="flex items-start gap-3 text-sm font-semibold">
                  <input checked={rememberMe} className="mt-1 h-4 w-4" onChange={(event) => setRememberMe(event.target.checked)} type="checkbox" />
                  <span>{t("registration.lessonAccess.rememberMe")}</span>
                </label>
                <p className="text-xs text-muted-foreground">{t("registration.lessonAccess.rememberHint")}</p>
                <Button disabled={busy} type="submit">{t("registration.lessonAccess.confirmCode")}</Button>
              </form>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}

function acceptResult(result: LessonAccessAttempt, setStep: (step: LessonEntryStep) => void) {
  if ((result.status === "AUTHORIZATION_READY" || result.status === "AUTHENTICATED_READY") && result.authorizationUrl) {
    window.location.assign(result.authorizationUrl);
    return;
  }
  setStep(stepForStatus(result.status));
}

function tokenFromFragment(): string | null {
  return lessonTokenFromHash(window.location.hash);
}

function clearFragment() {
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
}

function Status({ icon, text }: { icon?: ReactNode; text: string }) {
  return <div aria-live="polite" className="flex items-center gap-2 rounded-2xl border border-border bg-muted/60 p-4 text-sm font-bold text-muted-foreground">{icon}{text}</div>;
}

const inputClass = "h-11 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
