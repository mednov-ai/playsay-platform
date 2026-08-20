function enabled(value: string | undefined): boolean {
  return import.meta.env.DEV || value === "true";
}

export const vocabularyFeatures = {
  practice: enabled(import.meta.env.VITE_VOCABULARY_PRACTICE_ENABLED),
  homework: enabled(import.meta.env.VITE_VOCABULARY_HOMEWORK_ENABLED),
  live: enabled(import.meta.env.VITE_VOCABULARY_LIVE_ENABLED),
  key: enabled(import.meta.env.VITE_VOCABULARY_KEY_ENABLED),
  personalPracticeV2: enabled(import.meta.env.VITE_PERSONAL_PRACTICE_V2_ENABLED),
  composer: enabled(import.meta.env.VITE_VOCABULARY_COMPOSER_ENABLED),
  adaptivePolicy: enabled(import.meta.env.VITE_VOCABULARY_ADAPTIVE_POLICY_ENABLED),
  deliveryPolicies: enabled(import.meta.env.VITE_VOCABULARY_DELIVERY_POLICIES_ENABLED),
  keyNgrams: enabled(import.meta.env.VITE_VOCABULARY_KEY_NGRAMS_ENABLED),
  generatedMedia: enabled(import.meta.env.VITE_VOCABULARY_GENERATED_MEDIA_ENABLED),
} as const;
