import {
  clearTokens,
  getValidAccessToken,
  authConfig,
  type AuthConfig,
} from "../auth/oidc";
import { apiErrorFromResponse, apiFetch, notAuthenticatedError } from "./errors";
import { currentApiLanguage } from "./locale";
import type {
  AnonymousProfile,
  ClaimAnonymousProgressRequest,
  ClaimAnonymousProgressResponse,
  ChordSet,
  LayoutId,
  Me,
  Progress,
  ResolveAnonymousProfileRequest,
  ResetAnonymousProfileRequest,
  SubmitAnonymousResult,
  SubmitResult,
  SubmitTrainingResultResponse,
  UpdateAnonymousProfileRequest,
  VocabularyPracticeResponse,
  VocabularySessionPracticeResponse,
} from "../types";

const apiBaseUrl = import.meta.env.VITE_KEYBOARD_API_BASE_URL ?? "";

export function keyboardApiPath(path: string, query?: URLSearchParams): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const suffix = query && Array.from(query.keys()).length > 0 ? `?${query.toString()}` : "";
  return `${apiBaseUrl}/api${normalizedPath}${suffix}`;
}

async function apiJson<T>(
  path: string,
  init: RequestInit,
  config: AuthConfig = authConfig,
  expectedStatus = 200,
): Promise<T> {
  const accessToken = await getValidAccessToken(config);
  if (!accessToken) {
    throw notAuthenticatedError();
  }

  const response = await apiFetch(path, {
    ...init,
    headers: {
      "Accept-Language": currentApiLanguage(),
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== expectedStatus) {
    throw await apiErrorFromResponse(response);
  }

  if (expectedStatus === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function publicApiJson<T>(path: string, init: RequestInit, expectedStatus = 200): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: {
      "Accept-Language": currentApiLanguage(),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (response.status !== expectedStatus) {
    throw await apiErrorFromResponse(response);
  }

  if (expectedStatus === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function fetchMe(): Promise<Me> {
  return apiJson<Me>(keyboardApiPath("/me"), { method: "GET" });
}

export function fetchChordSets(layout: LayoutId, difficulty?: number): Promise<ChordSet[]> {
  const query = new URLSearchParams({ layout });
  if (difficulty != null) {
    query.set("difficulty", String(difficulty));
  }
  return apiJson<ChordSet[]>(keyboardApiPath("/chord-sets", query), { method: "GET" });
}

export function submitResult(body: SubmitResult): Promise<SubmitTrainingResultResponse> {
  return apiJson<SubmitTrainingResultResponse>(
    keyboardApiPath("/training/results"),
    { method: "POST", body: JSON.stringify(body) },
    authConfig,
    201,
  );
}

export function fetchProgress(): Promise<Progress> {
  return apiJson<Progress>(keyboardApiPath("/training/progress"), { method: "GET" });
}

export function fetchVocabularyPractice(): Promise<VocabularyPracticeResponse> {
  return apiJson<VocabularyPracticeResponse>(`${apiBaseUrl}/api/vocabulary/practice?limit=32`, { method: "GET" });
}

export function fetchVocabularySessionPractice(sessionId: string): Promise<VocabularySessionPracticeResponse> {
  return apiJson<VocabularySessionPracticeResponse>(
    `${apiBaseUrl}/api/vocabulary/practice-sessions/${encodeURIComponent(sessionId)}/key-set`,
    { method: "GET" },
  );
}

export function claimAnonymousProgress(body: ClaimAnonymousProgressRequest): Promise<ClaimAnonymousProgressResponse> {
  return apiJson<ClaimAnonymousProgressResponse>(
    keyboardApiPath("/training/claim-anonymous"),
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function resolveAnonymousProfile(body: ResolveAnonymousProfileRequest): Promise<AnonymousProfile> {
  return publicApiJson<AnonymousProfile>(
    keyboardApiPath("/anonymous/profile/resolve"),
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function updateAnonymousProfile(body: UpdateAnonymousProfileRequest): Promise<AnonymousProfile> {
  return publicApiJson<AnonymousProfile>(
    keyboardApiPath("/anonymous/profile"),
    { method: "PUT", body: JSON.stringify(body) },
  );
}

export function resetAnonymousProfile(body: ResetAnonymousProfileRequest): Promise<void> {
  return publicApiJson<void>(
    keyboardApiPath("/anonymous/profile/reset"),
    { method: "POST", body: JSON.stringify(body) },
    204,
  );
}

export function submitAnonymousResult(body: SubmitAnonymousResult): Promise<SubmitTrainingResultResponse> {
  return publicApiJson<SubmitTrainingResultResponse>(
    keyboardApiPath("/anonymous/training/results"),
    { method: "POST", body: JSON.stringify(body) },
    201,
  );
}
