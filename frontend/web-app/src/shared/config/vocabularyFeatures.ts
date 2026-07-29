function enabled(value: string | undefined): boolean {
  return import.meta.env.DEV || value === "true";
}

export const vocabularyFeatures = {
  practice: enabled(import.meta.env.VITE_VOCABULARY_PRACTICE_ENABLED),
  homework: enabled(import.meta.env.VITE_VOCABULARY_HOMEWORK_ENABLED),
  live: enabled(import.meta.env.VITE_VOCABULARY_LIVE_ENABLED),
  key: enabled(import.meta.env.VITE_VOCABULARY_KEY_ENABLED),
  personalPracticeV2: enabled(import.meta.env.VITE_PERSONAL_PRACTICE_V2_ENABLED),
} as const;
