export const supportedLanguages = ["ru", "en", "de", "fr"] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];

export const defaultLanguage: SupportedLanguage = "ru";

export const languageNames: Record<SupportedLanguage, string> = {
  ru: "Русский",
  en: "English",
  de: "Deutsch",
  fr: "Français",
};

export const i18nStorageKey = "playsay.language";

export function normalizeLanguage(value: string | null | undefined): SupportedLanguage {
  if (!value) {
    return defaultLanguage;
  }

  const normalized = value.toLowerCase().split(/[-_]/)[0];
  return supportedLanguages.includes(normalized as SupportedLanguage)
    ? (normalized as SupportedLanguage)
    : defaultLanguage;
}
