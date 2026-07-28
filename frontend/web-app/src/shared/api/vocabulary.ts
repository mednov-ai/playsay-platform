import { authConfig, getValidAccessToken } from "./auth";
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
  practicePaused: boolean;
  updatedAt: string;
}

export type VocabularySkill = "MEANING" | "FORM" | "SPELLING" | "CONTEXT";
export type VocabularyLearningStage = "NEW" | "LEARNING" | "REVIEW" | "MASTERED";
export type VocabularyPracticeRating = "AGAIN" | "HARD" | "GOOD";
export type VocabularyPracticeDelivery = "SELF" | "HOMEWORK" | "LIVE";
export type VocabularyPracticeMode = "QUICK" | "BALANCED" | "WRITING" | "KEYBOARD";
export type VocabularyPracticeStatus = "PREPARING" | "PUBLISHED" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED" | "FAILED";
export type VocabularySessionStatus = "NOT_STARTED" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type VocabularyExerciseType = "FLASHCARD" | "MATCHING" | "MEANING_CHOICE" | "PHRASE_BUILDER" | "FORM_INPUT" | "CONTEXT_GAP" | "KEYBOARD";

export interface VocabularySkillState {
  skill: VocabularySkill;
  stage: VocabularyLearningStage;
  intervalIndex: number;
  dueAt: string;
  successStreak: number;
  lapseCount: number;
  lastRating?: VocabularyPracticeRating | null;
  lastPracticedAt?: string | null;
}

export interface VocabularyLearningEntry {
  entry: VocabularyEntry;
  stage: VocabularyLearningStage;
  dueAt: string;
  overdue: boolean;
  skills: VocabularySkillState[];
}

export interface VocabularyDashboard {
  ownerSubject: string;
  ownerName?: string | null;
  totalCount: number;
  dueCount: number;
  learningCount: number;
  masteredCount: number;
  needsTranslationCount: number;
  difficultCount: number;
  lastPracticedAt?: string | null;
  entries: VocabularyLearningEntry[];
}

export interface VocabularyLearnerSummary {
  ownerSubject: string;
  ownerName: string;
  totalCount: number;
  dueCount: number;
  learningCount: number;
  masteredCount: number;
  needsTranslationCount: number;
  difficultCount: number;
  lastPracticedAt?: string | null;
}

export interface VocabularyPracticeItem {
  id: string;
  position: number;
  entryId?: string | null;
  skill: VocabularySkill;
  exerciseType: VocabularyExerciseType;
  prompt: string;
  options: string[];
  sourceText?: string | null;
  translation?: string | null;
  example?: string | null;
}

export interface VocabularyPracticeSession {
  id: string;
  ownerSubject: string;
  ownerName?: string | null;
  status: VocabularySessionStatus;
  revision: number;
  completedItems: number;
  totalItems: number;
  correctCount: number;
  attemptCount: number;
  accuracy?: number | null;
  currentItem?: VocabularyPracticeItem | null;
  teacherHint?: string | null;
  helpRequested: boolean;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt: string;
}

export interface VocabularyPractice {
  id: string;
  delivery: VocabularyPracticeDelivery;
  mode: VocabularyPracticeMode;
  status: VocabularyPracticeStatus;
  lessonId?: string | null;
  assignmentId?: string | null;
  sessions: VocabularyPracticeSession[];
  createdAt: string;
  updatedAt: string;
}

export interface VocabularyPracticeSettings {
  ownerSubjects?: string[];
  delivery?: VocabularyPracticeDelivery;
  mode?: VocabularyPracticeMode;
  lessonId?: string;
  assignmentId?: string;
  wordLimit?: number;
  pinnedEntryIds?: string[];
  excludedEntryIds?: string[];
}

export interface VocabularyPracticePreview {
  mode: VocabularyPracticeMode;
  delivery: VocabularyPracticeDelivery;
  estimatedMinutes: number;
  owners: Array<{
    ownerSubject: string;
    ownerName?: string | null;
    selectedCount: number;
    estimatedItemCount: number;
    dueCount: number;
    newCount: number;
    needsTranslationCount: number;
    entries: VocabularyEntry[];
  }>;
}

export interface VocabularyAttemptInput {
  clientAttemptId: string;
  itemId: string;
  sessionRevision: number;
  answer?: string;
  rating?: VocabularyPracticeRating;
  hintsUsed?: number;
  durationMs?: number;
}

export interface VocabularyAttemptResult {
  attemptId: string;
  rating: VocabularyPracticeRating;
  correct: boolean;
  expectedAnswer: string;
  session: VocabularyPracticeSession;
}

export interface VocabularyOverview {
  lessonEntries: VocabularyEntry[];
  recentEntries: VocabularyEntry[];
}

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
  input: Partial<Pick<VocabularyEntry, "translation" | "partOfSpeech" | "example" | "exampleTranslation" | "translationState" | "status" | "practicePaused">>,
): Promise<VocabularyEntry> {
  return apiJson(`/api/vocabulary/entries/${id}`, { method: "PATCH", body: JSON.stringify(input) }, authConfig);
}

export function fetchVocabularyLearners(query = ""): Promise<VocabularyLearnerSummary[]> {
  const suffix = query ? `?query=${encodeURIComponent(query)}` : "";
  return apiJson(`/api/vocabulary/learners${suffix}`, { method: "GET" }, authConfig);
}

export function fetchVocabularyDashboard(ownerSubject?: string, query = "", lessonId?: string): Promise<VocabularyDashboard> {
  const params = new URLSearchParams();
  if (ownerSubject) params.set("ownerSubject", ownerSubject);
  if (query) params.set("query", query);
  if (lessonId) params.set("lessonId", lessonId);
  const suffix = params.size ? `?${params.toString()}` : "";
  return apiJson(`/api/vocabulary/dashboard${suffix}`, { method: "GET" }, authConfig);
}

export function previewVocabularyPractice(input: VocabularyPracticeSettings): Promise<VocabularyPracticePreview> {
  return apiJson("/api/vocabulary/practices/preview", { method: "POST", body: JSON.stringify(input) }, authConfig);
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

export function fetchVocabularyPracticeHistory(ownerSubject?: string, lessonId?: string): Promise<VocabularyPracticeSession[]> {
  const params = new URLSearchParams();
  if (ownerSubject) params.set("ownerSubject", ownerSubject);
  if (lessonId) params.set("lessonId", lessonId);
  const suffix = params.size ? `?${params.toString()}` : "";
  return apiJson(`/api/vocabulary/practice-sessions${suffix}`, { method: "GET" }, authConfig);
}

export function recordVocabularyAttempt(sessionId: string, input: VocabularyAttemptInput): Promise<VocabularyAttemptResult> {
  return apiJson(`/api/vocabulary/practice-sessions/${sessionId}/attempts`, { method: "POST", body: JSON.stringify(input) }, authConfig, 201);
}

export function giveVocabularyPracticeHint(sessionId: string): Promise<VocabularyPracticeSession> {
  return apiJson(`/api/vocabulary/practice-sessions/${sessionId}/hint`, { method: "POST" }, authConfig);
}

export function requestVocabularyPracticeHelp(sessionId: string): Promise<VocabularyPracticeSession> {
  return apiJson(`/api/vocabulary/practice-sessions/${sessionId}/help-request`, { method: "POST" }, authConfig);
}
