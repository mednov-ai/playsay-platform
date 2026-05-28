export { changeAppLanguage, i18n } from "./config";
export {
  defaultLanguage,
  i18nStorageKey,
  normalizeLanguage,
  supportedLanguages,
  type SupportedLanguage,
} from "./languages";
export {
  consumePendingLoginLanguage,
  pendingLoginLanguageStorageKey,
  rememberPendingLoginLanguage,
  resolveAuthenticatedLanguage,
  type AuthenticatedLanguageResolution,
} from "./sessionLanguage";
export { translationDomains, type TranslationDomain } from "./keys";
export { useAppTranslation } from "./hooks/useAppTranslation";
