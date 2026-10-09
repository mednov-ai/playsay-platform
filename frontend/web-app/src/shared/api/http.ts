import { getCredentialGeneration, getValidAccessToken, readTokens, rejectAccessToken, type AuthConfig } from "./auth";
import { apiErrorFromResponse, apiFetch, notAuthenticatedError } from "./errors";
import { currentApiLanguage } from "./locale";
import { sessionChangedError, sessionRejectedError, sessionUnavailableError } from "./sessionRecovery";

export async function authorizedOptions(config: AuthConfig): Promise<RequestInit> {
  const accessToken = await getValidAccessToken(config);
  if (!accessToken) {
    throw notAuthenticatedError();
  }

  if (readTokens()?.accessToken !== accessToken) throw sessionChangedError();
  return {
    headers: {
      "Accept-Language": currentApiLanguage(),
      Authorization: `Bearer ${accessToken}`,
    },
  };
}

export async function authorizedRequest<T extends { status: number }>(
  config: AuthConfig, request: (options: RequestInit) => Promise<T>, deadlineMs?: number,
): Promise<T> {
  const options = await authorizedOptions(config);
  const generation = getCredentialGeneration();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const task = request({ ...options, ...(deadlineMs ? { signal: controller.signal } : {}) });
    const response = deadlineMs ? await Promise.race([task, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(sessionUnavailableError()); }, deadlineMs);
    })]) : await task;
    assertAuthorizedResponse(response, options, generation);
    return response;
  } finally { clearTimeout(timer); }
}

export function assertAuthorizedResponse(response: { status: number }, options: RequestInit, generation: number): void {
  if (generation !== getCredentialGeneration()) throw sessionChangedError();
  if (response.status === 401) {
    const header = new Headers(options.headers).get("Authorization");
    if (header && rejectAccessToken(header.slice(7))) throw sessionRejectedError();
    throw sessionChangedError();
  }
}

export async function apiJson<T>(
  path: string,
  init: RequestInit,
  config: AuthConfig,
  expectedStatus = 200,
): Promise<T> {
  const authorized = await authorizedOptions(config);
  const generation = getCredentialGeneration();
  const response = await apiFetch(path, {
    ...init,
    headers: {
      ...authorized.headers,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (generation !== getCredentialGeneration()) throw sessionChangedError();
  if (response.status === 401) {
    const token = (authorized.headers as Record<string, string>).Authorization.slice(7);
    if (rejectAccessToken(token)) throw sessionRejectedError();
    throw sessionChangedError();
  }

  if (response.status !== expectedStatus) {
    throw await apiErrorFromResponse(response, "");
  }

  if (expectedStatus === 204) {
    return undefined as T;
  }

  const result = (await response.json()) as T;
  if (generation !== getCredentialGeneration()) throw sessionChangedError();
  return result;
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
