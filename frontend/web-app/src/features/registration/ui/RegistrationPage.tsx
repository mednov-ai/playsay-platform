import { CheckCircle2, KeyRound, Loader2, Mail, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { startLogin } from "../../../shared/api/playsay";
import {
  confirmRegistrationRequest,
  forgotPasswordRequest,
  isRegistrationRateLimitError,
  resendRegistrationRequest,
  resetPasswordRequest,
  startRegistrationRequest,
} from "../../../shared/api/registration";
import { useAppTranslation } from "../../../shared/i18n";
import { LanguageSwitcher } from "../../../shared/i18n/ui/LanguageSwitcher";
import { BrandMark } from "../../../shared/ui/BrandMark";
import { Button } from "../../../components/ui/button";
import { ThemeToggle } from "../../../shared/theme/ThemeToggle";
import { useAppTheme } from "../../../app/AppProviders";
import type { RegistrationRoute } from "../../../app/routes";
import { checkPassword, type PasswordCheck, type PasswordIssue } from "../model/passwordPolicy";

const mainSiteUrl = "https://play-and-say.ru";

export function RegistrationPage({ route }: { route: RegistrationRoute }) {
  const { i18n, t } = useAppTranslation();
  const theme = useAppTheme();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialReturnTo = params.get("returnTo") ?? "";
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [resetCode, setResetCode] = useState(params.get("code") ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [rateLimitDialogOpen, setRateLimitDialogOpen] = useState(false);
  const [startSuccessHref, setStartSuccessHref] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmedContinueUrl, setConfirmedContinueUrl] = useState<string | null>(null);
  const startPasswordCheck = useMemo(
    () => checkPassword(password, email, displayName),
    [displayName, email, password],
  );
  const resetPasswordCheck = useMemo(
    () => checkPassword(newPassword, email),
    [email, newPassword],
  );

  useEffect(() => {
    if (route.kind !== "confirm") {
      return;
    }
    const token = params.get("token") ?? "";
    if (!token) {
      setMessage(t("registration.messages.missingToken"));
      return;
    }
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    void confirmRegistrationRequest({ token })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setConfirmedContinueUrl(result.continueUrl ?? null);
        setMessage(t("registration.messages.confirmed"));
      })
      .catch(() => {
        if (!cancelled) {
          setMessage(t("registration.messages.confirmFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params, route.kind, t]);

  async function submitStart() {
    if (!startPasswordCheck.isValid || password !== passwordConfirm) {
      setMessage(t("registration.messages.passwordInvalid"));
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      await startRegistrationRequest({
        displayName: displayName.trim() || undefined,
        email: email.trim(),
        locale: i18n.language,
        password,
        returnTo: initialReturnTo || undefined,
      });
      const next = new URL("/register/check-email", window.location.origin);
      next.searchParams.set("email", email.trim());
      if (initialReturnTo) {
        next.searchParams.set("returnTo", initialReturnTo);
      }
      setStartSuccessHref(next.pathname + next.search);
    } catch (caught) {
      handleRegistrationError(caught, t("registration.messages.startFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function submitForgotPassword() {
    setLoading(true);
    setMessage(null);
    try {
      await forgotPasswordRequest({
        email: email.trim(),
        locale: i18n.language,
        returnTo: initialReturnTo || undefined,
      });
      const next = new URL("/reset-password", window.location.origin);
      next.searchParams.set("email", email.trim());
      if (initialReturnTo) {
        next.searchParams.set("returnTo", initialReturnTo);
      }
      setMessage(t("registration.messages.resetCodeSent"));
      window.history.pushState({}, document.title, next.pathname + next.search);
      window.dispatchEvent(new Event("popstate"));
    } catch (caught) {
      handleRegistrationError(caught, t("registration.messages.resetStartFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function submitResetPassword() {
    if (!resetPasswordCheck.isValid || newPassword !== newPasswordConfirm) {
      setMessage(t("registration.messages.passwordInvalid"));
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      await resetPasswordRequest({
        code: resetCode.trim(),
        email: email.trim(),
        newPassword,
      });
      setResetCode("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setMessage(t("registration.messages.passwordReset"));
    } catch (caught) {
      handleRegistrationError(caught, t("registration.messages.resetFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setLoading(true);
    setMessage(null);
    try {
      await resendRegistrationRequest({
        email: email.trim(),
        locale: i18n.language,
        returnTo: initialReturnTo || undefined,
      });
      setMessage(t("registration.messages.resent"));
    } catch (caught) {
      handleRegistrationError(caught, t("registration.messages.resendFailed"));
    } finally {
      setLoading(false);
    }
  }

  function handleRegistrationError(caught: unknown, fallbackMessage: string) {
    if (isRegistrationRateLimitError(caught)) {
      setRateLimitDialogOpen(true);
      return;
    }
    setMessage(fallbackMessage);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-5 py-6 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <BrandMark />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <LanguageSwitcher disabled={loading} />
            <ThemeToggle mode={theme.mode} onModeChange={theme.setMode} resolvedTheme={theme.resolvedTheme} />
            <Button onClick={() => void startLogin()} type="button" variant="outline">
              {t("auth.login")}
            </Button>
          </div>
        </header>

        <section className="grid flex-1 content-center gap-5">
          <div className="rounded-[1.5rem] border border-border bg-background/85 p-5 shadow-sm sm:p-7">
            <div className="flex items-center gap-3 border-b border-border pb-5">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
                {route.kind === "confirm" ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : route.kind === "check-email" || route.kind === "forgot-password" ? (
                  <Mail className="h-5 w-5" />
                ) : route.kind === "reset-password" ? (
                  <KeyRound className="h-5 w-5" />
                ) : (
                  <UserPlus className="h-5 w-5" />
                )}
              </span>
              <div>
                <h1 className="text-2xl font-extrabold">{t(`registration.${route.kind}.title`)}</h1>
                <p className="text-sm font-semibold text-muted-foreground">{t(`registration.${route.kind}.subtitle`)}</p>
              </div>
            </div>

            {route.kind === "start" ? (
              <form
                className="grid gap-4 pt-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitStart();
                }}
              >
                <label className="grid gap-1 text-sm font-bold">
                  <span>{t("registration.form.email")}</span>
                  <input className="playsay-input" disabled={loading} maxLength={320} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
                </label>
                <label className="grid gap-1 text-sm font-bold">
                  <span>{t("registration.form.password")}</span>
                  <input className="playsay-input" disabled={loading} minLength={8} maxLength={128} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
                </label>
                <label className="grid gap-1 text-sm font-bold">
                  <span>{t("registration.form.confirmPassword")}</span>
                  <input className="playsay-input" disabled={loading} minLength={8} maxLength={128} onChange={(event) => setPasswordConfirm(event.target.value)} required type="password" value={passwordConfirm} />
                </label>
                <PasswordHints check={startPasswordCheck} confirmValue={passwordConfirm} passwordValue={password} t={t} />
                <label className="grid gap-1 text-sm font-bold">
                  <span>{t("registration.form.displayName")}</span>
                  <input className="playsay-input" disabled={loading} maxLength={120} onChange={(event) => setDisplayName(event.target.value)} type="text" value={displayName} />
                </label>
                {message ? <RegistrationMessage message={message} /> : null}
                <Button disabled={loading || !startPasswordCheck.isValid || password !== passwordConfirm} type="submit">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  {t("registration.actions.create")}
                </Button>
                <a className="text-sm font-extrabold text-primary" href={`/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`}>
                  {t("registration.actions.forgotPassword")}
                </a>
              </form>
            ) : null}

            {route.kind === "check-email" ? (
              <div className="grid gap-4 pt-5">
                <RegistrationMessage message={message ?? t("registration.messages.checkEmail", { email })} />
                <div className="flex flex-wrap gap-2">
                  <Button disabled={loading || !email} onClick={() => void resend()} type="button">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    {t("registration.actions.resend")}
                  </Button>
                  <Button onClick={() => void startLogin()} type="button" variant="outline">
                    {t("auth.login")}
                  </Button>
                </div>
              </div>
            ) : null}

            {route.kind === "confirm" ? (
              <div className="grid gap-4 pt-5">
                <RegistrationMessage message={message ?? t("registration.messages.confirming")} />
                <RegistrationConfirmActions
                  continueLabel={t("registration.actions.openTrainer")}
                  continueUrl={confirmedContinueUrl}
                  loading={loading}
                  onSignIn={() => void startLogin()}
                  signInLabel={confirmedContinueUrl ? t("registration.actions.signInOnline") : t("registration.actions.signIn")}
                />
              </div>
            ) : null}

            {route.kind === "forgot-password" ? (
              <form
                className="grid gap-4 pt-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitForgotPassword();
                }}
              >
                <label className="grid gap-1 text-sm font-bold">
                  <span>{t("registration.form.email")}</span>
                  <input className="playsay-input" disabled={loading} maxLength={320} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
                </label>
                {message ? <RegistrationMessage message={message} /> : null}
                <Button disabled={loading || !email.trim()} type="submit">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  {t("registration.actions.sendResetCode")}
                </Button>
                <a className="text-sm font-extrabold text-primary" href="/register">
                  {t("registration.actions.backToRegister")}
                </a>
              </form>
            ) : null}

            {route.kind === "reset-password" ? (
              <form
                className="grid gap-4 pt-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitResetPassword();
                }}
              >
                <label className="grid gap-1 text-sm font-bold">
                  <span>{t("registration.form.email")}</span>
                  <input className="playsay-input" disabled={loading} maxLength={320} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
                </label>
                <label className="grid gap-1 text-sm font-bold">
                  <span>{t("registration.form.code")}</span>
                  <input className="playsay-input" disabled={loading} inputMode="numeric" maxLength={12} minLength={6} onChange={(event) => setResetCode(event.target.value)} required type="text" value={resetCode} />
                </label>
                <label className="grid gap-1 text-sm font-bold">
                  <span>{t("registration.form.newPassword")}</span>
                  <input className="playsay-input" disabled={loading} minLength={8} maxLength={128} onChange={(event) => setNewPassword(event.target.value)} required type="password" value={newPassword} />
                </label>
                <label className="grid gap-1 text-sm font-bold">
                  <span>{t("registration.form.confirmPassword")}</span>
                  <input className="playsay-input" disabled={loading} minLength={8} maxLength={128} onChange={(event) => setNewPasswordConfirm(event.target.value)} required type="password" value={newPasswordConfirm} />
                </label>
                <PasswordHints check={resetPasswordCheck} confirmValue={newPasswordConfirm} passwordValue={newPassword} t={t} />
                {message ? <RegistrationMessage message={message} /> : null}
                <div className="flex flex-wrap gap-2">
                  <Button disabled={loading || !resetCode.trim() || !resetPasswordCheck.isValid || newPassword !== newPasswordConfirm} type="submit">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                    {t("registration.actions.resetPassword")}
                  </Button>
                  <Button onClick={() => void startLogin()} type="button" variant="outline">
                    {t("auth.login")}
                  </Button>
                </div>
              </form>
            ) : null}

            <a className="mt-5 inline-flex text-sm font-extrabold text-primary" href={mainSiteUrl}>
              {t("welcome.returnToSite")}
            </a>
          </div>
        </section>
      </section>
      <RegistrationRateLimitDialog
        body={t("registration.rateLimit.body")}
        closeLabel={t("common.actions.close")}
        onClose={() => setRateLimitDialogOpen(false)}
        open={rateLimitDialogOpen}
        title={t("registration.rateLimit.title")}
      />
      <RegistrationStartSuccessDialog
        body={t("registration.startSuccess.body", { email: email.trim() })}
        checkEmailHref={startSuccessHref ?? "/register/check-email"}
        closeLabel={t("common.actions.close")}
        continueLabel={t("registration.actions.checkEmailPage")}
        onClose={() => setStartSuccessHref(null)}
        open={startSuccessHref != null}
        title={t("registration.startSuccess.title")}
      />
    </main>
  );
}

export function RegistrationStartSuccessDialog({
  body,
  checkEmailHref,
  closeLabel,
  continueLabel,
  onClose,
  open,
  title,
}: {
  body: string;
  checkEmailHref: string;
  closeLabel: string;
  continueLabel: string;
  onClose: () => void;
  open: boolean;
  title: string;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 px-4 py-6">
      <div
        aria-labelledby="registration-start-success-title"
        aria-modal="true"
        className="grid w-full max-w-md gap-4 rounded-[1.5rem] border border-border bg-background p-5 text-foreground shadow-xl"
        role="dialog"
      >
        <div className="grid gap-2">
          <h2 className="text-xl font-extrabold" id="registration-start-success-title">
            {title}
          </h2>
          <p className="text-sm font-semibold leading-6 text-muted-foreground">{body}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose} type="button" variant="outline">
            {closeLabel}
          </Button>
          <Button asChild>
            <a href={checkEmailHref}>{continueLabel}</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RegistrationConfirmActions({
  continueLabel,
  continueUrl,
  loading,
  onSignIn,
  signInLabel,
}: {
  continueLabel: string;
  continueUrl: string | null;
  loading: boolean;
  onSignIn: () => void;
  signInLabel: string;
}) {
  if (continueUrl) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button asChild disabled={loading}>
          <a href={continueUrl}>
            <CheckCircle2 className="h-4 w-4" />
            {continueLabel}
          </a>
        </Button>
        <Button disabled={loading} onClick={onSignIn} type="button" variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {signInLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={loading} onClick={onSignIn} type="button">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {signInLabel}
      </Button>
    </div>
  );
}

export function RegistrationRateLimitDialog({
  body,
  closeLabel,
  onClose,
  open,
  title,
}: {
  body: string;
  closeLabel: string;
  onClose: () => void;
  open: boolean;
  title: string;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 px-4 py-6">
      <div
        aria-labelledby="registration-rate-limit-title"
        aria-modal="true"
        className="grid w-full max-w-md gap-4 rounded-[1.5rem] border border-border bg-background p-5 text-foreground shadow-xl"
        role="dialog"
      >
        <div className="grid gap-2">
          <h2 className="text-xl font-extrabold" id="registration-rate-limit-title">
            {title}
          </h2>
          <p className="text-sm font-semibold leading-6 text-muted-foreground">{body}</p>
        </div>
        <div className="flex justify-end">
          <Button onClick={onClose} type="button">
            {closeLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RegistrationMessage({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
      {message}
    </div>
  );
}

function PasswordHints({
  check,
  confirmValue,
  passwordValue,
  t,
}: {
  check: PasswordCheck;
  confirmValue: string;
  passwordValue: string;
  t: (key: string) => string;
}) {
  const issues: PasswordIssue[] = ["tooShort", "needsVariety", "tooCommon", "containsEmail", "containsName", "tooLong"];
  const passwordsMatch = Boolean(passwordValue) && Boolean(confirmValue) && passwordValue === confirmValue;

  return (
    <div className="grid gap-2 rounded-2xl border border-border bg-muted/60 p-3">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <span
            className={index < check.score ? "h-1.5 flex-1 rounded-full bg-primary" : "h-1.5 flex-1 rounded-full bg-border"}
            key={index}
          />
        ))}
      </div>
      <ul className="grid gap-1 text-xs font-semibold text-muted-foreground">
        {issues.map((issue) => (
          <li className={check.issues.includes(issue) ? "" : "text-primary"} key={issue}>
            {t(`registration.password.${issue}`)}
          </li>
        ))}
        <li className={passwordsMatch ? "text-primary" : ""}>{t("registration.password.match")}</li>
      </ul>
    </div>
  );
}
