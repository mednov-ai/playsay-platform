import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthGate } from "../widgets/shell/AuthGate";
import { KeyboardTrainerShell } from "../widgets/shell/KeyboardTrainerShell";
import { buildLogoutUrl, clearTokens, completeLogin, isAuthCallback, readTokens, startLogin } from "../shared/auth/oidc";
import { fetchMe } from "../shared/api/keyboardApi";
import { changeAppLanguage, supportedLanguages, type SupportedLanguage } from "../shared/i18n";
import { useThemeMode, type ThemeMode } from "../shared/theme";
import type { Me } from "../shared/types";

type AuthStatus = "checking" | "callback" | "authenticated" | "unauthenticated" | "error";

export function App() {
  const { t, i18n } = useTranslation();
  const { mode, setMode } = useThemeMode();
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      const url = new URL(window.location.href);
      try {
        if (isAuthCallback(url)) {
          setStatus("callback");
          await completeLogin(url);
          window.history.replaceState({}, "", "/");
        } else if (!readTokens()) {
          setStatus("unauthenticated");
          return;
        }

        const profile = await fetchMe();
        if (!cancelled) {
          setMe(profile);
          setStatus("authenticated");
        }
      } catch (caught: unknown) {
        clearTokens();
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
          setStatus("error");
        }
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLanguageChange = (language: SupportedLanguage) => {
    void changeAppLanguage(language);
  };

  const handleSignIn = () => {
    setStatus("checking");
    void startLogin().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("error");
    });
  };

  const handleLogout = () => {
    const logoutUrl = buildLogoutUrl();
    clearTokens();
    window.location.assign(logoutUrl);
  };

  if (status === "checking" || status === "callback") {
    return (
      <AuthGate
        status={status === "callback" ? "callback" : "checking"}
        error={error}
        language={(i18n.resolvedLanguage ?? "ru") as SupportedLanguage}
        languages={Object.fromEntries(
          supportedLanguages.map((language) => [language, t(`language.${language}`)]),
        ) as Record<SupportedLanguage, string>}
        languageLabel={t("language.label")}
        themeMode={mode}
        themeLabels={{
          system: t("theme.system"),
          light: t("theme.light"),
          dark: t("theme.dark"),
        } as Record<ThemeMode, string>}
        title={t("app.title")}
        wordmark={t("app.wordmark")}
        product={t("app.product")}
        publicSiteAriaLabel={t("app.publicSiteAria")}
        signInLabel={t("auth.signIn")}
        loadingLabel={t("auth.loading")}
        callbackLabel={t("auth.callback")}
        errorLabel={t("auth.failed")}
        retryLabel={t("auth.retry")}
        onLanguageChange={handleLanguageChange}
        onThemeChange={setMode}
        onSignIn={handleSignIn}
      />
    );
  }

  return (
    <KeyboardTrainerShell
      me={status === "authenticated" ? me : null}
      authError={status === "error" ? error : undefined}
      themeMode={mode}
      onThemeChange={setMode}
      onLogout={handleLogout}
      onSignIn={handleSignIn}
    />
  );
}
