export const translationDomains = [
  "common",
  "auth",
  "registration",
  "shell",
  "chat",
  "profile",
  "workspace",
  "schedule",
  "homework",
  "courses",
  "materials",
  "classroom",
  "userManagement",
  "payments",
  "errors",
] as const;

export type TranslationDomain = (typeof translationDomains)[number];
