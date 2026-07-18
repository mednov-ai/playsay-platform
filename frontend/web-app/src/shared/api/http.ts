import { clearTokens, getValidAccessToken, type AuthConfig } from "./auth";
import { apiErrorFromResponse, apiFetch, notAuthenticatedError } from "./errors";
import { currentApiLanguage } from "./locale";

export async function authorizedOptions(config: AuthConfig): Promise<RequestInit> {
  const accessToken = await getValidAccessToken(config);
  if (!accessToken) {
    throw notAuthenticatedError();
  }

  return {
    headers: {
      "Accept-Language": currentApiLanguage(),
      Authorization: `Bearer ${accessToken}`,
    },
  };
}

export async function apiJson<T>(
  path: string,
  init: RequestInit,
  config: AuthConfig,
  expectedStatus = 200,
): Promise<T> {
  const authorized = await authorizedOptions(config);
  const response = await apiFetch(path, {
    ...init,
    headers: {
      ...authorized.headers,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== expectedStatus) {
    throw await apiErrorFromResponse(response, "");
  }

  if (expectedStatus === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function publicApiJson<T>(
  path: string,
  init: RequestInit,
  expectedStatus = 200,
): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: {
      "Accept-Language": currentApiLanguage(),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (response.status !== expectedStatus) {
    throw await apiErrorFromResponse(response, "");
  }

  if (expectedStatus === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
