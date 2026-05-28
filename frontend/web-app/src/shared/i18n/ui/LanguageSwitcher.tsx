import { Languages } from "lucide-react";
import type { HTMLAttributes } from "react";
import type { AppUserProfile, UpdateUserProfileInput } from "../../api/playsay";
import {
  changeAppLanguage,
  normalizeLanguage,
  supportedLanguages,
  useAppTranslation,
  type SupportedLanguage,
} from "../index";
import { useState } from "react";

export function LanguageSwitcher({
  className,
  disabled = false,
  onSaveProfile,
  profile,
}: {
  className?: HTMLAttributes<HTMLDivElement>["className"];
  disabled?: boolean;
  onSaveProfile?: (input: UpdateUserProfileInput) => Promise<void>;
  profile?: AppUserProfile | null;
}) {
  const { i18n, t } = useAppTranslation();
  const [saving, setSaving] = useState(false);
  const currentLanguage = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);

  async function handleLanguageChange(language: SupportedLanguage) {
    setSaving(true);
    try {
      const normalized = await changeAppLanguage(language);
      if (profile && onSaveProfile) {
        await onSaveProfile(profileInputWithLanguage(profile, normalized));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={className ?? "inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-bold text-foreground"}>
      <Languages className="h-4 w-4 text-primary" />
      <span className="sr-only">{t("common.language")}</span>
      <select
        aria-label={t("common.language")}
        className="bg-transparent text-sm font-bold outline-none"
        disabled={disabled || saving}
        onChange={(event) => void handleLanguageChange(event.target.value as SupportedLanguage)}
        value={currentLanguage}
      >
        {supportedLanguages.map((language) => (
          <option key={language} value={language}>
            {i18n.t("common.languageNativeName", { lng: language })}
          </option>
        ))}
      </select>
    </div>
  );
}

function profileInputWithLanguage(profile: AppUserProfile, language: SupportedLanguage): UpdateUserProfileInput {
  return {
    displayName: profile.displayName ?? null,
    learningGoal: profile.learningGoal ?? null,
    locale: language,
    timezone: profile.timezone ?? null,
  };
}
