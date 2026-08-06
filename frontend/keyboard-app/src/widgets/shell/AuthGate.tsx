import { publicSiteUrl } from "@playsay/shared-ui";
import { LogIn, RefreshCw } from "lucide-react";
import type { ThemeMode } from "../../shared/theme";
import { ThemeToggle } from "../../shared/theme/ThemeToggle";
import type { SupportedLanguage } from "../../shared/i18n";
import { HoneySchoolLockup } from "../../shared/ui/HoneySchoolLockup";

interface Props {
  status: "checking" | "callback" | "error" | "idle";
  error?: string;
  language: SupportedLanguage;
  languages: Record<SupportedLanguage, string>;
  languageLabel: string;
  themeMode: ThemeMode;
  themeLabels: Record<ThemeMode, string>;
  title: string;
  product: string;
  publicSiteAriaLabel: string;
  signInLabel: string;
  loadingLabel: string;
  callbackLabel: string;
  errorLabel: string;
  retryLabel: string;
  onLanguageChange: (language: SupportedLanguage) => void;
  onThemeChange: (mode: ThemeMode) => void;
  onSignIn: () => void;
}

export function AuthGate({
  status,
  error,
  language,
  languages,
  languageLabel,
  themeMode,
  themeLabels,
  title,
  product,
  publicSiteAriaLabel,
  signInLabel,
  loadingLabel,
  callbackLabel,
  errorLabel,
  retryLabel,
  onLanguageChange,
  onThemeChange,
  onSignIn,
}: Props) {
  const busy = status === "checking" || status === "callback";

  return (
    <main className="auth-page">
      <div className="auth-page__topbar">
        <a className="brand-lockup" href={publicSiteUrl} aria-label={publicSiteAriaLabel}>
          <HoneySchoolLockup ariaLabel={title} product={product} />
        </a>
        <div className="topbar-actions">
          <label className="language-select">
            <span>{languageLabel}</span>
            <select value={language} onChange={(event) => onLanguageChange(event.target.value as SupportedLanguage)}>
              {Object.entries(languages).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <ThemeToggle mode={themeMode} labels={themeLabels} onChange={onThemeChange} />
        </div>
      </div>

      <section className="auth-panel" aria-busy={busy}>
        <img
          alt=""
          aria-hidden="true"
          className="auth-panel__mark"
          height="512"
          src="/brand/logo/honey-school-mark.svg"
          width="512"
        />
        <h1>{title}</h1>
        {status === "error" ? (
          <>
            <p>{errorLabel}</p>
            {error ? <code>{error}</code> : null}
            <button type="button" className="primary-button" onClick={onSignIn}>
              <RefreshCw size={18} aria-hidden="true" />
              <span>{retryLabel}</span>
            </button>
          </>
        ) : (
          <>
            <p>{status === "callback" ? callbackLabel : status === "checking" ? loadingLabel : signInLabel}</p>
            <button type="button" className="primary-button" disabled={busy} onClick={onSignIn}>
              <LogIn size={18} aria-hidden="true" />
              <span>{busy ? loadingLabel : signInLabel}</span>
            </button>
          </>
        )}
      </section>
    </main>
  );
}
