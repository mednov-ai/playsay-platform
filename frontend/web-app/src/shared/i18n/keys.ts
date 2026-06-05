export const translationDomains = [
  "common",
  "auth",
  "registration",
  "shell",
  "profile",
  "workspace",
  "schedule",
  "homework",
  "courses",
  "materials",
  "classroom",
  "payments",
  "errors",
] as const;

export type TranslationDomain = (typeof translationDomains)[number];
