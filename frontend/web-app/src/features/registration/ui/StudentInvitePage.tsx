import { CheckCircle2, Clock3, KeyRound, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppTheme } from "../../../app/AppProviders";
import { Button } from "../../../components/ui/button";
import { storeTokens } from "../../../shared/api/auth";
import { consumeStudentInviteRequest } from "../../../shared/api/registration";
import type { StudentInviteConsumeResult } from "../../../shared/api/types";
import { useAppTranslation } from "../../../shared/i18n";
import { LanguageSwitcher } from "../../../shared/i18n/ui/LanguageSwitcher";
import { ThemeToggle } from "../../../shared/theme/ThemeToggle";
import { BrandMark } from "../../../shared/ui/BrandMark";
import { clearStudentInviteSecretFromAddressBar, studentInviteTokenFromLocation } from "../model/studentInviteToken";

const inviteConsumeRequests = new Map<string, Promise<StudentInviteConsumeResult>>();

export function StudentInvitePage() {
  const { t } = useAppTranslation();
  const theme = useAppTheme();
  const [token] = useState(() => studentInviteTokenFromLocation(window.location));
  const [status, setStatus] = useState<"loading" | "waiting" | "success" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [continueUrl, setContinueUrl] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage(t("registration.studentInvite.missingToken"));
      return undefined;
    }

    clearStudentInviteSecretFromAddressBar();
    let cancelled = false;
    void consumeStudentInviteOnce(token)
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (result.status === "WAITING") {
          const opensAt = new Date(result.opensAt);
          setStatus("waiting");
          setMessage(t("registration.studentInvite.waiting", { time: formatLessonTime(opensAt) }));
          const retryDelay = Math.max(1000, Math.min((result.retryAfterSeconds ?? 60) * 1000, 60_000));
          window.setTimeout(() => {
            if (!cancelled) {
              setStatus("loading");
              setAttempt((value) => value + 1);
            }
          }, retryDelay);
          return;
        }
        storeTokens({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken ?? undefined,
          idToken: result.idToken ?? undefined,
          expiresAt: Date.now() + result.expiresIn * 1000,
        });
        setStatus("success");
        setMessage(t("registration.studentInvite.success"));
        setContinueUrl(result.continueUrl);
        window.setTimeout(() => {
          window.location.assign(resolveContinueUrl(result.continueUrl));
        }, 150);
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
          setMessage(t("registration.studentInvite.failed"));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, t, token]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-5 py-6 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <BrandMark />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <LanguageSwitcher disabled={status === "loading"} />
            <ThemeToggle mode={theme.mode} onModeChange={theme.setMode} resolvedTheme={theme.resolvedTheme} />
          </div>
        </header>

        <section className="grid flex-1 content-center gap-5">
          <div className="rounded-[1.5rem] border border-border bg-background/85 p-5 shadow-sm sm:p-7">
            <div className="flex items-center gap-3 border-b border-border pb-5">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
                {status === "success" ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : status === "waiting" ? (
                  <Clock3 className="h-5 w-5" />
                ) : (
                  <KeyRound className="h-5 w-5" />
                )}
              </span>
              <div>
                <h1 className="text-2xl font-extrabold">{t("registration.studentInvite.title")}</h1>
                <p className="text-sm font-semibold text-muted-foreground">{t("registration.studentInvite.subtitle")}</p>
              </div>
            </div>

            <div className="grid gap-4 pt-5">
              <div className="rounded-2xl border border-border bg-muted/60 p-4 text-sm font-bold text-muted-foreground">
                {status === "loading" ? t("registration.studentInvite.loading") : message}
              </div>
              {status === "loading" ? (
                <div className="inline-flex items-center gap-2 text-sm font-extrabold text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("registration.studentInvite.loading")}
                </div>
              ) : null}
              {status === "waiting" ? (
                <Button onClick={() => {
                  setStatus("loading");
                  setAttempt((value) => value + 1);
                }} type="button" variant="outline">
                  {t("registration.studentInvite.retry")}
                </Button>
              ) : null}
              {status === "success" && continueUrl ? (
                <Button onClick={() => window.location.assign(resolveContinueUrl(continueUrl))} type="button">
                  {t("registration.actions.continue")}
                </Button>
              ) : null}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function consumeStudentInviteOnce(token: string): Promise<StudentInviteConsumeResult> {
  const existing = inviteConsumeRequests.get(token);
  if (existing) {
    return existing;
  }

  const request = consumeStudentInviteRequest(token).finally(() => {
    window.setTimeout(() => inviteConsumeRequests.delete(token), 0);
  });
  inviteConsumeRequests.set(token, request);
  return request;
}

function resolveContinueUrl(value: string): string {
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin === window.location.origin) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
    return url.toString();
  } catch {
    return "/";
  }
}

function formatLessonTime(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}
