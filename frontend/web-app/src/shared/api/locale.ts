import { i18n, normalizeLanguage } from "../i18n";

export function currentApiLanguage(): string {
  return normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);
}
