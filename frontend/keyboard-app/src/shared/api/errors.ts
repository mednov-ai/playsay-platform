import { i18n } from "../i18n";

type ApiErrorBody = {
  errorCode?: string;
  message?: string;
  detail?: string;
  error?: string;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiErrorFromResponse(response: Response, _fallback?: string): Promise<ApiError> {
  const fallback = i18n.t("errors.requestFailed", { status: response.status });
  try {
    const body = (await response.json()) as ApiErrorBody;
    return new ApiError(response.status, body.errorCode ?? "HTTP_ERROR", fallback);
  } catch {
    return new ApiError(response.status, "HTTP_ERROR", fallback);
  }
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", i18n.t("errors.network"));
  }
}

export function notAuthenticatedError(): ApiError {
  return new ApiError(401, "NOT_AUTHENTICATED", i18n.t("errors.notAuthenticated"));
}
