type ProjectErrorBody = {
  status?: number;
  errorCode?: string;
  message?: string;
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

export function apiErrorFromData(status: number, data: unknown, fallbackMessage: string): ApiError {
  if (isProjectErrorBody(data)) {
    return new ApiError(
      status,
      data.errorCode ?? fallbackErrorCode,
      data.message?.trim() || fallbackMessage,
    );
  }

  return new ApiError(status, fallbackErrorCode, fallbackMessage);
}

export async function apiErrorFromResponse(response: Response, fallbackMessage: string): Promise<ApiError> {
  const body = await response.text().catch(() => "");
  const data = body ? safeJsonParse(body) : null;
  return apiErrorFromData(response.status, data, fallbackMessage);
}

export function isApiStatus(caught: unknown, status: number): boolean {
  if (caught instanceof ApiError) {
    return caught.status === status;
  }

  return caught instanceof Error && caught.message.includes(`HTTP ${status}`);
}

function isProjectErrorBody(value: unknown): value is ProjectErrorBody {
  return typeof value === "object" && value !== null && "message" in value;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

const fallbackErrorCode = "HTTP_ERROR";
