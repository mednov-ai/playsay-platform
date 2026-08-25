import { authConfig, clearTokens, type AuthConfig } from "./auth";
import { apiErrorFromResponse, apiFetch } from "./errors";
import { apiJson, authorizedOptions } from "./http";

export type WorksheetImportStatus = "ANALYZING" | "REVIEW_REQUIRED" | "READY" | "FAILED" | "MATERIALIZED";
export type WorksheetPageRole = "WORKSHEET" | "ANSWER_KEY" | "STATIC_REFERENCE";
export type WorksheetSectionType =
  | "TYPED_GAPS" | "SINGLE_CHOICE_GAPS" | "WORD_BANK_GAPS" | "FORM_TRANSFORM"
  | "MATCHING_TEXT_TEXT" | "MATCHING_TEXT_IMAGE" | "MULTIPLE_CHOICE" | "FLASHCARDS" | "STATIC_CONTENT";

export interface WorksheetRegion { x: number; y: number; width: number; height: number; anchor?: string; anchorId?: string | null }
export interface WorksheetReviewedValue { value: string; provenance: "ANSWER_KEY" | "VISIBLE_TEXT" | "AI_INFERENCE" | "TEACHER"; confidence: number; confirmed: boolean }
export interface WorksheetGap {
  id: string; region: WorksheetRegion; prompt?: string | null; answer?: WorksheetReviewedValue | null;
  acceptedAnswers: string[]; options: string[]; distractors: WorksheetReviewedValue[]; wordBankOptionId?: string | null; baseForm?: string | null;
}
export interface WorksheetPairEndpoint { region: WorksheetRegion; kind: "TEXT" | "IMAGE"; text?: string | null; imageAlt?: string | null }
export interface WorksheetPair { id: string; number: number; left: WorksheetPairEndpoint; right: WorksheetPairEndpoint }
export interface WorksheetChoiceOption { id: string; order: number; region?: WorksheetRegion | null; text: string; provenance: WorksheetReviewedValue["provenance"]; confidence: number; confirmed: boolean }
export interface WorksheetQuestion { id: string; prompt: string; promptRegion?: WorksheetRegion | null; options: WorksheetChoiceOption[]; correctOptionIds: string[] }
export interface WorksheetCardSide { kind: "TEXT" | "IMAGE"; text?: string | null; region?: WorksheetRegion | null; provenance: WorksheetReviewedValue["provenance"]; confidence: number; confirmed: boolean }
export interface WorksheetFlashcard { id: string; order: number; front: WorksheetCardSide; back: WorksheetCardSide | null }
export interface WorksheetReviewPage {
  id: string;
  order: number;
  role: WorksheetPageRole;
  answerKeyPageId?: string | null;
  sections: WorksheetSectionType[];
  groups: WorksheetInteractionGroup[];
}
export interface WorksheetInteractionGroup {
  id: string;
  order: number;
  type: "FILL_GAPS" | "MATCHING_PAIRS" | "MULTIPLE_CHOICE" | "FLASHCARDS";
  gapMode?: "TYPED" | "SINGLE_CHOICE" | "WORD_BANK" | "FORM_TRANSFORM" | null;
  gaps?: WorksheetGap[];
  pairs?: WorksheetPair[];
  questions?: WorksheetQuestion[];
  cards?: WorksheetFlashcard[];
  wordBank?: string[];
}
export interface WorksheetReview { pages: WorksheetReviewPage[]; attribution?: string | null; rightsNote?: string | null }
export interface WorksheetImportPage {
  id: string; sourceId: string; sourcePageNumber?: number | null; order: number; width: number; height: number; previewUrl: string;
  snapCandidates: Array<{ id: string; text: string; confidence: number; region: WorksheetRegion }>;
}
export interface WorksheetImportSource { id: string; order: number; kind: "IMAGE" | "PDF"; fileName: string; mimeType: string; byteSize: number; checksumSha256: string; pageCount: number }
export interface WorksheetImportSession {
  id: string; status: WorksheetImportStatus; revision: number; title: string; language: string; cefrLevel: string;
  sources: WorksheetImportSource[]; pages: WorksheetImportPage[]; review?: WorksheetReview | null;
  blockers: Array<{ code: string; pageId: string; groupId?: string | null; itemId?: string | null }>;
  failureClass?: string | null; materialId?: string | null;
}
export interface WorksheetImportCreation { session: WorksheetImportSession; rejectedSources: Array<{ fileName: string; code: string }> }

export async function createWorksheetImport(
  input: { title: string; language: string; cefrLevel: string; sourceNote: string },
  files: File[],
  config: AuthConfig = authConfig,
): Promise<WorksheetImportCreation> {
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(input)], { type: "application/json" }));
  files.forEach((file) => form.append("files", file));
  const authorized = await authorizedOptions(config);
  const response = await apiFetch("/api/worksheet-imports", { method: "POST", body: form, headers: authorized.headers });
  if (response.status === 401) clearTokens();
  if (response.status !== 201) throw await apiErrorFromResponse(response, "");
  return response.json() as Promise<WorksheetImportCreation>;
}

export const fetchWorksheetImport = (sessionId: string, config: AuthConfig = authConfig) =>
  apiJson<WorksheetImportSession>(`/api/worksheet-imports/${sessionId}`, { method: "GET" }, config);

export const saveWorksheetImportReview = (sessionId: string, revision: number, review: WorksheetReview, config: AuthConfig = authConfig) =>
  apiJson<WorksheetImportSession>(`/api/worksheet-imports/${sessionId}/review`, {
    method: "PUT", headers: { "If-Match": String(revision) }, body: JSON.stringify(review),
  }, config);

export const continueWorksheetImportManually = (sessionId: string, config: AuthConfig = authConfig) =>
  apiJson<WorksheetImportSession>(`/api/worksheet-imports/${sessionId}/continue-manually`, { method: "POST" }, config);

export const retryWorksheetImportAnalysis = (sessionId: string, config: AuthConfig = authConfig) =>
  apiJson<WorksheetImportSession>(`/api/worksheet-imports/${sessionId}/retry`, { method: "POST" }, config);

export const cancelWorksheetImport = (sessionId: string, config: AuthConfig = authConfig) =>
  apiJson<void>(`/api/worksheet-imports/${sessionId}`, { method: "DELETE" }, config, 204);

export const materializeWorksheetImport = (
  sessionId: string, revision: number, rightsConfirmed: boolean, config: AuthConfig = authConfig,
) => apiJson<{ materialId: string }>(`/api/worksheet-imports/${sessionId}/materialize`, {
  method: "POST", body: JSON.stringify({ expectedRevision: revision, rightsConfirmed }),
}, config);

export async function fetchWorksheetPagePreview(sessionId: string, pageId: string, config: AuthConfig = authConfig): Promise<string> {
  const authorized = await authorizedOptions(config);
  const response = await apiFetch(`/api/worksheet-imports/${sessionId}/pages/${pageId}/preview`, { headers: authorized.headers });
  if (response.status === 401) clearTokens();
  if (response.status !== 200) throw await apiErrorFromResponse(response, "");
  return URL.createObjectURL(await response.blob());
}
