export const translationDomains = [
  "common",
  "auth",
  "shell",
  "profile",
  "workspace",
  "schedule",
  "homework",
  "courses",
  "materials",
  "classroom",
  "errors",
] as const;

export type TranslationDomain = (typeof translationDomains)[number];
