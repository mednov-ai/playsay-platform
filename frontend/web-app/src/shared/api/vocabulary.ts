import { authConfig } from "./auth";
import { apiJson } from "./http";

export type VocabularySourceType = "LESSON" | "HOMEWORK" | "MANUAL";
export type TranslationState = "MISSING" | "SUGGESTED" | "CONFIRMED";

export interface TranslationSuggestion {
  translation: string;
  partOfSpeech?: string;
  example?: string;
  exampleTranslation?: string;
  source: string;
}

export interface VocabularyEntry {
  id: string;
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
  translation?: string;
  partOfSpeech?: string;
  example?: string;
  exampleTranslation?: string;
  translationState: TranslationState;
  status: "ACTIVE" | "ARCHIVED";
  updatedAt: string;
}

export interface CreateVocabularyEntry {
  ownerSubject?: string;
  sourceText: string;
  translation?: string;
  partOfSpeech?: string;
  example?: string;
  exampleTranslation?: string;
  translationState?: TranslationState;
  sourceType: VocabularySourceType;
  lessonId?: string;
  assignmentId?: string;
  materialId?: string;
  blockId?: string;
  context?: string;
}

export function suggestVocabularyTranslation(input: Pick<CreateVocabularyEntry, "sourceText" | "context">): Promise<TranslationSuggestion> {
  return apiJson("/api/vocabulary/translation-suggestions", { method: "POST", body: JSON.stringify(input) }, authConfig);
}

export function createVocabularyEntry(input: CreateVocabularyEntry): Promise<VocabularyEntry> {
  return apiJson("/api/vocabulary/entries", { method: "POST", body: JSON.stringify(input) }, authConfig, 201);
}

export function fetchVocabularyEntries(query = ""): Promise<VocabularyEntry[]> {
  const suffix = query ? `?query=${encodeURIComponent(query)}` : "";
  return apiJson(`/api/vocabulary/entries${suffix}`, { method: "GET" }, authConfig);
}

export function archiveVocabularyEntry(id: string): Promise<void> {
  return apiJson(`/api/vocabulary/entries/${id}`, { method: "DELETE" }, authConfig, 204);
}
