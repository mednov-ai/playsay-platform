import { de } from "./de";
import { en } from "./en";
import { fr } from "./fr";
import { ru } from "./ru";

export const resources = {
  ru: { translation: ru },
  en: { translation: en },
  de: { translation: de },
  fr: { translation: fr },
} as const;

export type AppTranslationResource = typeof ru;
