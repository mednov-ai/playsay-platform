import { authConfig, getValidAccessToken } from "./auth";
import { apiJson, authorizedOptions } from "./http";
import { apiErrorFromResponse, apiFetch } from "./errors";
import type {
  AttemptRequest as GeneratedAttemptRequest,
  AttemptResponse as GeneratedAttemptResponse,
  CreateEntry as GeneratedCreateEntry,
  Delivery as GeneratedDelivery,
  ExerciseType as GeneratedExerciseType,
  LearningStage as GeneratedLearningStage,
  LearningEntry as GeneratedLearningEntry,
  LearnerSummary as GeneratedLearnerSummary,
  Practice as GeneratedPractice,
  PracticeItem as GeneratedPracticeItem,
  PracticeMode as GeneratedPracticeMode,
  PracticePreview as GeneratedPracticePreview,
  PracticeSession as GeneratedPracticeSession,
  PracticeSettings as GeneratedPracticeSettings,
  PracticeStatus as GeneratedPracticeStatus,
  Rating as GeneratedRating,
  SessionStatus as GeneratedSessionStatus,
  Skill as GeneratedSkill,
  SkillState as GeneratedSkillState,
  SourceType as GeneratedSourceType,
  TranslationState as GeneratedTranslationState,
  TranslationSuggestion as GeneratedTranslationSuggestion,
  TranslationSuggestionRequest as GeneratedTranslationSuggestionRequest,
  TranslationVariant as GeneratedTranslationVariant,
  VocabularyDashboard as GeneratedVocabularyDashboard,
  VocabularyEntry as GeneratedVocabularyEntry,
  VocabularyOverview as GeneratedVocabularyOverview,
  SelectionCriteria as GeneratedSelectionCriteria,
  SelectionRecipe as GeneratedSelectionRecipe,
  SelectionRecipeRequest as GeneratedSelectionRecipeRequest,
  MediaView as GeneratedMediaView,
  MediaAsset as GeneratedMediaAsset,
  MediaOverride as GeneratedMediaOverride,
  MediaReview as GeneratedMediaReview,
} from "../../generated/vocabulary-api";

export type VocabularySourceType = GeneratedSourceType;
export type TranslationState = GeneratedTranslationState;
export type TranslationVariant = GeneratedTranslationVariant;
export type TranslationSuggestion = GeneratedTranslationSuggestion;
export type TranslationSuggestionInput = GeneratedTranslationSuggestionRequest;
export type VocabularyEntry = GeneratedVocabularyEntry;

export type VocabularySkill = GeneratedSkill;
export type VocabularyLearningStage = GeneratedLearningStage;
export type VocabularyPracticeRating = GeneratedRating;
export type VocabularyPracticeDelivery = GeneratedDelivery;
export type VocabularyPracticeMode = GeneratedPracticeMode;
export type VocabularyPracticeStatus = GeneratedPracticeStatus;
export type VocabularySessionStatus = GeneratedSessionStatus;
export type VocabularyExerciseType = GeneratedExerciseType;

export type VocabularySkillState = GeneratedSkillState;
export type VocabularyLearningEntry = GeneratedLearningEntry;
export type VocabularyDashboard = GeneratedVocabularyDashboard;
export type VocabularyLearnerSummary = GeneratedLearnerSummary;

export type VocabularyPracticeItem = GeneratedPracticeItem;
export type VocabularyPracticeSession = GeneratedPracticeSession;
export type VocabularyPractice = GeneratedPractice;
export type VocabularyPracticeSettings = GeneratedPracticeSettings;
export type VocabularyPracticePreview = GeneratedPracticePreview;
export type VocabularyAttemptInput = GeneratedAttemptRequest;
export type VocabularyAttemptResult = GeneratedAttemptResponse;
export type VocabularySelectionCriteria = GeneratedSelectionCriteria;
export type VocabularySelectionRecipe = GeneratedSelectionRecipe;
export type VocabularySelectionRecipeInput = GeneratedSelectionRecipeRequest;
export type VocabularyMediaView = GeneratedMediaView;
export type VocabularyMediaAsset = GeneratedMediaAsset;
export type VocabularyMediaOverride = GeneratedMediaOverride;
export type VocabularyMediaReview = GeneratedMediaReview;

export type VocabularyOverview = GeneratedVocabularyOverview;

export interface VocabularyRealtimeMessage {
  type?: "connected" | "vocabulary.subscribed" | "vocabulary.practice.subscribed" | "vocabulary.entry.created" | "vocabulary.entry.updated" | "vocabulary.entry.archived" | "vocabulary.practice.started" | "vocabulary.practice.paused" | "vocabulary.practice.completed" | "vocabulary.session.updated" | "vocabulary.attempt.recorded" | "error";
  ownerSubject?: string;
  lessonId?: string;
  actorSubject?: string;
  entry?: VocabularyEntry;
  practiceId?: string;
  sessionId?: string;
  practice?: VocabularyPractice;
  message?: string;
}

export type CreateVocabularyEntry = GeneratedCreateEntry;

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

export function fetchVocabularyOverview(ownerSubject: string | undefined, lessonId: string | undefined, limit = 5): Promise<VocabularyOverview> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (ownerSubject) params.set("ownerSubject", ownerSubject);
  if (lessonId) params.set("lessonId", lessonId);
  return apiJson(`/api/vocabulary/overview?${params.toString()}`, { method: "GET" }, authConfig);
}

export async function openVocabularySocket(): Promise<WebSocket | null> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(`${protocol}//${window.location.host}/api/vocabulary/ws`, ["playsay", accessToken]);
}

export function archiveVocabularyEntry(id: string): Promise<void> {
  return apiJson(`/api/vocabulary/entries/${id}`, { method: "DELETE" }, authConfig, 204);
}

export function updateVocabularyEntry(
  id: string,
  input: Partial<Pick<VocabularyEntry, "translation" | "partOfSpeech" | "example" | "exampleTranslation" | "translationState" | "status" | "practicePaused" | "favorite">>,
): Promise<VocabularyEntry> {
  return apiJson(`/api/vocabulary/entries/${id}`, { method: "PATCH", body: JSON.stringify(input) }, authConfig);
}

export function fetchVocabularyEntryMedia(entryId: string, signal?: AbortSignal): Promise<VocabularyMediaView> {
  return apiJson(`/api/vocabulary/entries/${entryId}/media`, { method: "GET", signal }, authConfig);
}

export function regenerateVocabularyEntryMedia(entryId: string): Promise<VocabularyMediaView> {
  return apiJson(`/api/vocabulary/entries/${entryId}/media/regenerate`, { method: "POST" }, authConfig, 202);
}

export function updateVocabularyEntryMediaOverride(entryId: string, input: VocabularyMediaOverride): Promise<VocabularyMediaView> {
  return apiJson(`/api/vocabulary/entries/${entryId}/media/override`, { method: "PUT", body: JSON.stringify(input) }, authConfig);
}

export function reportVocabularyEntryMedia(entryId: string, assetId: string): Promise<VocabularyMediaView> {
  return apiJson(`/api/vocabulary/entries/${entryId}/media/assets/${assetId}/report`, { method: "POST", body: JSON.stringify({ reasonCode: "WRONG_SENSE" }) }, authConfig);
}

export function fetchVocabularyMediaCandidates(signal?: AbortSignal): Promise<VocabularyMediaAsset[]> {
  return apiJson("/api/vocabulary/media/candidates", { method: "GET", signal }, authConfig);
}

export function reviewVocabularyMediaCandidate(assetId: string, input: VocabularyMediaReview): Promise<VocabularyMediaAsset> {
  return apiJson(`/api/vocabulary/media/candidates/${assetId}`, { method: "PATCH", body: JSON.stringify(input) }, authConfig);
}

export async function fetchVocabularyMediaBlob(contentUrl: string, signal?: AbortSignal): Promise<Blob> {
  const authorized = await authorizedOptions(authConfig);
  const response = await apiFetch(contentUrl, { method: "GET", signal, headers: authorized.headers });
  if (!response.ok) throw await apiErrorFromResponse(response, "");
  return response.blob();
}

export function fetchVocabularyLearners(query = "", signal?: AbortSignal): Promise<VocabularyLearnerSummary[]> {
  const suffix = query ? `?query=${encodeURIComponent(query)}` : "";
  return apiJson(`/api/vocabulary/learners${suffix}`, { method: "GET", signal }, authConfig);
}

export function fetchVocabularyDashboard(ownerSubject?: string, query = "", lessonId?: string, signal?: AbortSignal): Promise<VocabularyDashboard> {
  const params = new URLSearchParams();
  if (ownerSubject) params.set("ownerSubject", ownerSubject);
  if (query) params.set("query", query);
  if (lessonId) params.set("lessonId", lessonId);
  const suffix = params.size ? `?${params.toString()}` : "";
  return apiJson(`/api/vocabulary/dashboard${suffix}`, { method: "GET", signal }, authConfig);
}

export function previewVocabularyPractice(input: VocabularyPracticeSettings, signal?: AbortSignal): Promise<VocabularyPracticePreview> {
  return apiJson("/api/vocabulary/practices/preview", { method: "POST", body: JSON.stringify(input), signal }, authConfig);
}

export function previewRecommendedVocabularyPractice(input: VocabularyPracticeSettings, signal?: AbortSignal): Promise<VocabularyPracticePreview> {
  return apiJson("/api/vocabulary/practices/recommended-preview", { method: "POST", body: JSON.stringify(input), signal }, authConfig);
}

export function fetchVocabularySelectionRecipes(signal?: AbortSignal): Promise<VocabularySelectionRecipe[]> {
  return apiJson("/api/vocabulary/selection-recipes", { method: "GET", signal }, authConfig);
}

export function createVocabularySelectionRecipe(input: VocabularySelectionRecipeInput): Promise<VocabularySelectionRecipe> {
  return apiJson("/api/vocabulary/selection-recipes", { method: "POST", body: JSON.stringify(input) }, authConfig, 201);
}

export function updateVocabularySelectionRecipe(id: string, input: VocabularySelectionRecipeInput): Promise<VocabularySelectionRecipe> {
  return apiJson(`/api/vocabulary/selection-recipes/${id}`, { method: "PUT", body: JSON.stringify(input) }, authConfig);
}

export function deleteVocabularySelectionRecipe(id: string): Promise<void> {
  return apiJson(`/api/vocabulary/selection-recipes/${id}`, { method: "DELETE" }, authConfig, 204);
}

export function createVocabularyPractice(input: VocabularyPracticeSettings): Promise<VocabularyPractice> {
  return apiJson("/api/vocabulary/practices", { method: "POST", body: JSON.stringify(input) }, authConfig, 201);
}

export function startSelfVocabularyPractice(input: Omit<VocabularyPracticeSettings, "delivery" | "ownerSubjects"> = {}): Promise<VocabularyPractice> {
  return apiJson("/api/vocabulary/practices/self", { method: "POST", body: JSON.stringify(input) }, authConfig);
}

export function fetchActiveVocabularyPractice(lessonId: string): Promise<VocabularyPractice | null> {
  return apiJson<{ practice?: VocabularyPractice | null }>(
    `/api/vocabulary/practices/active?lessonId=${encodeURIComponent(lessonId)}`,
    { method: "GET" },
    authConfig,
  ).then((response) => response.practice ?? null);
}

export function updateVocabularyPracticeStatus(
  practiceId: string,
  status: VocabularyPracticeStatus,
): Promise<VocabularyPractice> {
  return apiJson(`/api/vocabulary/practices/${practiceId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }, authConfig);
}

export function fetchVocabularyPracticeSession(sessionId: string): Promise<VocabularyPracticeSession> {
  return apiJson(`/api/vocabulary/practice-sessions/${sessionId}`, { method: "GET" }, authConfig);
}

export function fetchVocabularyPracticeHistory(ownerSubject?: string, lessonId?: string, signal?: AbortSignal): Promise<VocabularyPracticeSession[]> {
  const params = new URLSearchParams();
  if (ownerSubject) params.set("ownerSubject", ownerSubject);
  if (lessonId) params.set("lessonId", lessonId);
  const suffix = params.size ? `?${params.toString()}` : "";
  return apiJson(`/api/vocabulary/practice-sessions${suffix}`, { method: "GET", signal }, authConfig);
}

export function recordVocabularyAttempt(sessionId: string, input: VocabularyAttemptInput): Promise<VocabularyAttemptResult> {
  return apiJson(`/api/vocabulary/practice-sessions/${sessionId}/attempts`, { method: "POST", body: JSON.stringify(input) }, authConfig, 201);
}

export function revealVocabularyPracticeItem(sessionId: string, itemId: string): Promise<{ itemId: string; expectedAnswer: string }> {
  return apiJson(`/api/vocabulary/practice-sessions/${sessionId}/items/${itemId}/reveal`, { method: "POST" }, authConfig);
}

export function giveVocabularyPracticeHint(sessionId: string): Promise<VocabularyPracticeSession> {
  return apiJson(`/api/vocabulary/practice-sessions/${sessionId}/hint`, { method: "POST" }, authConfig);
}

export function requestVocabularyPracticeHelp(sessionId: string): Promise<VocabularyPracticeSession> {
  return apiJson(`/api/vocabulary/practice-sessions/${sessionId}/help-request`, { method: "POST" }, authConfig);
}
