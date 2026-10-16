import { gameRequest } from "./gameRequest";
import type { HtmlGamePageResponse, HtmlGameResponse, LessonGameLaunchResponse } from "../../generated/playsay-api";
import { authConfig, type AuthConfig } from "./auth";
import { apiErrorFromResponse, apiFetch } from "./errors";
import { apiJson as rawApiJson, authorizedOptions } from "./http";
import { validateHtmlGameUpload } from "./htmlGameUploadPolicy";

function apiJson<T>(path: string, init: RequestInit, config: AuthConfig, expectedStatus = 200): Promise<T> {
  return gameRequest((signal) => rawApiJson<T>(path, { ...init, signal }, config, expectedStatus), init.signal ?? undefined);
}

export type LibraryGame = HtmlGameResponse;
export type GameLaunch = LessonGameLaunchResponse;
export function listGames(query: URLSearchParams, signal?: AbortSignal) {
  return gameRequest((requestSignal) => apiJson<HtmlGamePageResponse>(`/api/games?${query}`, { method: "GET", signal: requestSignal }, authConfig), signal);
}
export async function uploadGame(file: File, commandId: string, game?: LibraryGame): Promise<LibraryGame> {
  validateHtmlGameUpload(file);
  const body = new FormData(); body.append("file", file);
  const path = game ? `/api/games/${game.id}/revisions?expectedVersion=${game.version}` : "/api/games";
  return gameRequest(async (signal) => {
    const options = await authorizedOptions(authConfig);
    const response = await apiFetch(path, { ...options, method: "POST", body, signal, headers: { ...options.headers, "Idempotency-Key": commandId } });
    if (response.status !== 201) throw await apiErrorFromResponse(response, "");
    return response.json() as Promise<LibraryGame>;
  });
}
export async function gameContent(gameId: string, revisionId: string, materialId?: string, signal?: AbortSignal): Promise<string> {
  const query = materialId && materialId !== "preview" ? `?materialId=${encodeURIComponent(materialId)}` : "";
  return gameRequest(async (requestSignal) => {
    const response = await apiFetch(`/api/games/${gameId}/revisions/${revisionId}/content${query}`, { ...await authorizedOptions(authConfig), signal: requestSignal });
    if (!response.ok) throw await apiErrorFromResponse(response, "");
    return response.text();
  }, signal);
}
export function archiveGame(id: string) { return apiJson<void>(`/api/games/${id}`, { method: "DELETE" }, authConfig, 204); }
export function forkGame(game: LibraryGame, commandId: string) { return apiJson<LibraryGame>(`/api/games/${game.id}/fork`, { method: "POST", body: JSON.stringify({ revisionId: game.revisionId, commandId }) }, authConfig); }
export function editGame(game: LibraryGame, title: string, topic: string, cefrLevel: string | null) { return apiJson<LibraryGame>(`/api/games/${game.id}`, { method: "PATCH", body: JSON.stringify({ title, topic, cefrLevel, expectedVersion: game.version }) }, authConfig); }
export function attachGame(game: LibraryGame, materialId: string, pageId: string, blockId: string, expectedUpdatedAt: string) {
  return apiJson(`/api/materials/${materialId}/games`, { method: "POST", body: JSON.stringify({ gameId: game.id, revisionId: game.revisionId, pageId, blockId, expectedUpdatedAt }) }, authConfig);
}

export function currentLessonGame(lessonId: string, signal?: AbortSignal) { return apiJson<import("../../generated/playsay-api").LessonGameStateResponse>(`/api/schedule/lessons/${lessonId}/game-launches/current`, { method: "GET", signal }, authConfig); }
export function startLessonGame(lessonId: string, game: LibraryGame, commandId: string) { return apiJson<GameLaunch>(`/api/schedule/lessons/${lessonId}/game-launches`, { method: "POST", body: JSON.stringify({ gameId: game.id, revisionId: game.revisionId, commandId, protocolVersion: 1 }) }, authConfig); }
export function stopLessonGame(lessonId: string, launchId: string) { return apiJson<GameLaunch>(`/api/schedule/lessons/${lessonId}/game-launches/${launchId}/stop`, { method: "POST" }, authConfig); }
export function lessonGameDocument(lessonId: string, launchId: string, signal?: AbortSignal) { return apiJson<import("./types").CollaborationDocument>(`/api/schedule/lessons/${lessonId}/game-launches/${launchId}/document`, { method: "GET", signal }, authConfig); }
export async function lessonGameContent(lessonId: string, launchId: string, signal?: AbortSignal): Promise<string> {
  const response = await apiFetch(`/api/schedule/lessons/${lessonId}/game-launches/${launchId}/content`, { ...await authorizedOptions(authConfig), signal });
  if (!response.ok) throw await apiErrorFromResponse(response, "");
  return response.text();
}

export function createMaterialFromGame(game: LibraryGame, commandId: string) {
  return apiJson<import("./types").LessonMaterial>(`/api/games/${game.id}/materials`, { method: "POST", body: JSON.stringify({ revisionId: game.revisionId, commandId }) }, authConfig);
}

export function gameCover(game: Pick<LibraryGame, "id" | "revisionId">, signal?: AbortSignal, materialId?: string): Promise<Blob> {
  return gameRequest(async (requestSignal) => {
    const response = await apiFetch(`/api/games/${game.id}/revisions/${game.revisionId}/cover${materialId ? `?materialId=${encodeURIComponent(materialId)}` : ""}`, { ...await authorizedOptions(authConfig), signal: requestSignal });
    if (!response.ok) throw await apiErrorFromResponse(response, "");
    return response.blob();
  }, signal);
}

export type GameProcessing = import("../../generated/playsay-api").HtmlGameProcessingResponse;
export function requestGameProcessing(game: Pick<LibraryGame, "id" | "revisionId">, kind: "ADAPT" | "ENRICH", commandId: string) { return apiJson<GameProcessing>(`/api/games/${game.id}/processing`, { method: "POST", body: JSON.stringify({ revisionId: game.revisionId, kind, commandId }) }, authConfig); }
export function gameProcessing(gameId: string, id: string, signal?: AbortSignal) { return apiJson<GameProcessing>(`/api/games/${gameId}/processing/${id}`, { method: "GET", signal }, authConfig); }
export function applyGameCandidate(game: LibraryGame, id: string) { return apiJson<LibraryGame>(`/api/games/${game.id}/processing/${id}/apply?expectedVersion=${game.version}`, { method: "POST" }, authConfig); }
export function selectGameRevision(game: LibraryGame, revisionId: string) { return apiJson<LibraryGame>(`/api/games/${game.id}/select-revision`, { method: "POST", body: JSON.stringify({ revisionId, expectedVersion: game.version }) }, authConfig); }
export function gameCandidate(gameId: string, id: string, signal?: AbortSignal): Promise<string> {
  return gameRequest(async (requestSignal) => {
    const response = await apiFetch(`/api/games/${gameId}/processing/${id}/preview`, { ...await authorizedOptions(authConfig), signal: requestSignal });
    if (!response.ok) throw await apiErrorFromResponse(response, "");
    return response.text();
  }, signal);
}
