import {
  clearTokens,
  getValidAccessToken,
  authConfig,
  type AuthConfig,
} from "../auth/oidc";
import { apiErrorFromResponse } from "./errors";
import { currentApiLanguage } from "./locale";
import type { ChordSet, LayoutId, Me, Progress, SubmitResult, TrainingResult } from "../types";

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
    throw new Error("Not authenticated.");
  }

  const response = await fetch(path, {
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
    throw await apiErrorFromResponse(response, `API request ${path} failed with HTTP ${response.status}.`);
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

export function submitResult(body: SubmitResult): Promise<TrainingResult> {
  return apiJson<TrainingResult>(
    keyboardApiPath("/training/results"),
    { method: "POST", body: JSON.stringify(body) },
    authConfig,
    201,
  );
}

export function fetchProgress(): Promise<Progress> {
  return apiJson<Progress>(keyboardApiPath("/training/progress"), { method: "GET" });
}
