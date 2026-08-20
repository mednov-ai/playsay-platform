function enabled(value: string | undefined): boolean {
  return import.meta.env.DEV || value === "true";
}

export const vocabularyFeatures = {
  typedTargets: enabled(import.meta.env.VITE_VOCABULARY_TYPED_TARGETS_ENABLED),
} as const;
