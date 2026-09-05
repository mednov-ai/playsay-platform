import type { QueryClient } from "@tanstack/react-query";

export function refreshVocabularyQueries(client: QueryClient, owner = "self") {
  return client.invalidateQueries({ predicate: ({ queryKey }) => {
    const [family, scope] = queryKey;
    if (family === "vocabulary-learners") return true;
    if (family === "vocabulary-dashboard" || family === "vocabulary-history" || family === "vocabulary-dashboard-search") return scope === owner;
    if (family === "vocabulary-self-preview") return owner === "self";
    if (family === "vocabulary-practice-preview-v2" && typeof scope === "string" && scope) {
      const settings = JSON.parse(scope) as { selectedSubjects?: string[] };
      return settings.selectedSubjects?.includes(owner) ?? false;
    }
    return false;
  } });
}
