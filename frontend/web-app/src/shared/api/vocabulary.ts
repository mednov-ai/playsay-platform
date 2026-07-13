import { authConfig } from "./auth";
import { apiJson } from "./http";

export type VocabularySourceType = "LESSON" | "HOMEWORK" | "MANUAL";
export type TranslationState = "MISSING" | "SUGGESTED" | "CONFIRMED";

export interface TranslationVariant {
  translation: string;
  partOfSpeech?: string;
  example?: string;
  exampleTranslation?: string;
}

export interface TranslationSuggestion extends TranslationVariant {
  variants: TranslationVariant[];
  source: string;
}

export interface TranslationSuggestionInput {
  sourceText: string;
  context?: string;
  instruction?: string;
  previousTranslations?: string[];
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

export function suggestVocabularyTranslation(input: TranslationSuggestionInput, signal?: AbortSignal): Promise<TranslationSuggestion> {
  return apiJson("/api/vocabulary/translation-suggestions", { method: "POST", body: JSON.stringify(input), signal }, authConfig);
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
