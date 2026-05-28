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

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: defaultLanguage,
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
});

export async function changeAppLanguage(language: string): Promise<SupportedLanguage> {
  const normalizedLanguage = normalizeLanguage(language);
  await i18n.changeLanguage(normalizedLanguage);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(i18nStorageKey, normalizedLanguage);
  }

  return normalizedLanguage;
}

export { i18n };
