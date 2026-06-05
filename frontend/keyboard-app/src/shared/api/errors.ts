type ApiErrorBody = {
  message?: string;
  detail?: string;
  error?: string;
};

export async function apiErrorFromResponse(response: Response, fallback: string): Promise<Error> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return new Error(body.message ?? body.detail ?? body.error ?? fallback);
  } catch {
    return new Error(fallback);
  }
}
