import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { defaultLanguage, i18nStorageKey, normalizeLanguage, type SupportedLanguage } from "./languages";
import { resources } from "./resources";

function initialLanguage(): SupportedLanguage {
  if (typeof window === "undefined") {
    return defaultLanguage;
  }

  const storedLanguage = window.localStorage.getItem(i18nStorageKey);
  return normalizeLanguage(storedLanguage ?? window.navigator.language);
}

function syncDocumentLanguage(language: string): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.lang = normalizeLanguage(language);
}

const configuredInitialLanguage = initialLanguage();
syncDocumentLanguage(configuredInitialLanguage);

void i18n.use(initReactI18next).init({
  resources,
  lng: configuredInitialLanguage,
  fallbackLng: defaultLanguage,
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
});

i18n.on("languageChanged", syncDocumentLanguage);

export async function changeAppLanguage(language: string): Promise<SupportedLanguage> {
  const normalizedLanguage = normalizeLanguage(language);
  await i18n.changeLanguage(normalizedLanguage);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(i18nStorageKey, normalizedLanguage);
  }

  return normalizedLanguage;
}

export { i18n };
