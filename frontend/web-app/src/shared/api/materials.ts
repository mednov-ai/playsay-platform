import { authConfig, clearTokens } from "./auth";
import { apiErrorFromResponse, isApiStatus } from "./errors";
import { apiJson, authorizedOptions } from "./http";
import type {
  LessonMaterial,
  LessonMaterialAnnotation,
  LessonMaterialAnnotationInput,
  LessonMaterialAnswerSuggestions,
  LessonMaterialAnswerSuggestionsInput,
  LessonMaterialAsset,
  LessonMaterialAssetUpdateInput,
  LessonMaterialDraft,
  LessonMaterialDraftInput,
  LessonMaterialGenerateImagesInput,
  LessonMaterialInput,
  LessonMaterialSubmission,
  LessonMaterialSubmissionInput,
  LessonMaterialUrlDraftInput,
  LiveLessonImagePageResult,
  MaterialImagePageResult,
  MaterialVideoPlayback,
  MaterialVideoPlaybackInput,
} from "./types";

export async function fetchMaterials(config = authConfig): Promise<LessonMaterial[]> {
  return apiJson<LessonMaterial[]>("/api/materials", { method: "GET" }, config);
}

export async function saveMaterial(
  input: LessonMaterialInput,
  materialId?: string,
  config = authConfig,
): Promise<LessonMaterial> {
  return apiJson<LessonMaterial>(
    materialId ? `/api/materials/${materialId}` : "/api/materials",
    {
      method: materialId ? "PUT" : "POST",
      body: JSON.stringify(input),
    },
    config,
    materialId ? 200 : 201,
  );
}

export async function archiveMaterial(materialId: string, config = authConfig): Promise<void> {
  await apiJson<void>(`/api/materials/${materialId}`, { method: "DELETE" }, config, 204);
}

export async function draftMaterial(
  input: LessonMaterialDraftInput,
  config = authConfig,
): Promise<LessonMaterialDraft> {
  return apiJson<LessonMaterialDraft>(
    "/api/materials/ai-draft",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    config,
  );
}

export async function draftMaterialFromUrl(
  input: LessonMaterialUrlDraftInput,
  config = authConfig,
): Promise<LessonMaterialDraft> {
  return apiJson<LessonMaterialDraft>(
    "/api/materials/import-url",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    config,
  );
}

export async function generateMaterialImages(
  materialId: string,
  input: LessonMaterialGenerateImagesInput = {},
  config = authConfig,
): Promise<LessonMaterial> {
  return apiJson<LessonMaterial>(
    `/api/materials/${materialId}/generate-images`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    config,
  );
}

export async function suggestMaterialAcceptedAnswers(
  materialId: string,
  input: LessonMaterialAnswerSuggestionsInput,
  config = authConfig,
): Promise<LessonMaterialAnswerSuggestions> {
  return apiJson<LessonMaterialAnswerSuggestions>(
    `/api/materials/${materialId}/answer-suggestions`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    config,
  );
}

export async function createMaterialVideoPlayback(
  materialId: string,
  input: MaterialVideoPlaybackInput,
  config = authConfig,
): Promise<MaterialVideoPlayback> {
  return apiJson<MaterialVideoPlayback>(
    `/api/materials/${materialId}/video-playback`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    config,
  );
}

export async function fetchMaterialAssets(
  materialId: string,
  config = authConfig,
): Promise<LessonMaterialAsset[]> {
  return apiJson<LessonMaterialAsset[]>(`/api/materials/${materialId}/assets`, { method: "GET" }, config);
}

export async function fetchMaterialAssetObjectUrl(
  materialId: string,
  assetId: string,
  config = authConfig,
): Promise<string> {
  const authorized = await authorizedOptions(config);
  const response = await fetch(`/api/materials/${materialId}/assets/${assetId}/content`, {
    headers: authorized.headers,
  });

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw await apiErrorFromResponse(
      response,
      `Material asset content request failed with HTTP ${response.status}.`,
    );
  }

  return URL.createObjectURL(await response.blob());
}

export async function updateMaterialAsset(
  materialId: string,
  assetId: string,
  input: LessonMaterialAssetUpdateInput,
  config = authConfig,
): Promise<LessonMaterialAsset> {
  return apiJson<LessonMaterialAsset>(
    `/api/materials/${materialId}/assets/${assetId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
    config,
  );
}

export async function appendMaterialImagePage(
  materialId: string,
  file: File,
  title?: string | null,
  config = authConfig,
): Promise<MaterialImagePageResult> {
  return uploadImagePage<MaterialImagePageResult>(`/api/materials/${materialId}/image-page`, file, title, config);
}

export async function appendScheduledLessonImagePage(
  lessonId: string,
  file: File,
  title?: string | null,
  config = authConfig,
): Promise<LiveLessonImagePageResult> {
  return uploadImagePage<LiveLessonImagePageResult>(`/api/schedule/lessons/${lessonId}/image-page`, file, title, config);
}

export async function fetchScheduledLessonMaterial(
  lessonId: string,
  config = authConfig,
): Promise<LessonMaterial | null> {
  try {
    return await apiJson<LessonMaterial>(`/api/schedule/lessons/${lessonId}/material`, { method: "GET" }, config);
  } catch (caught) {
    if (isApiStatus(caught, 404)) {
      return null;
    }
    throw caught;
  }
}

async function uploadImagePage<T>(
  path: string,
  file: File,
  title: string | null | undefined,
  config = authConfig,
): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);
  if (title?.trim()) {
    formData.append("title", title.trim());
  }

  const authorized = await authorizedOptions(config);
  const response = await fetch(path, {
    body: formData,
    headers: authorized.headers,
    method: "POST",
  });

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 201) {
    throw await apiErrorFromResponse(response, `Image page upload failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as T;
}

export async function fetchScheduledLessonMaterialSubmission(
  lessonId: string,
  config = authConfig,
): Promise<LessonMaterialSubmission | null> {
  try {
    return await apiJson<LessonMaterialSubmission>(
      `/api/schedule/lessons/${lessonId}/material-submission`,
      { method: "GET" },
      config,
    );
  } catch (caught) {
    if (isApiStatus(caught, 404)) {
      return null;
    }
    throw caught;
  }
}

export async function fetchScheduledLessonMaterialSubmissions(
  lessonId: string,
  config = authConfig,
): Promise<LessonMaterialSubmission[]> {
  return apiJson<LessonMaterialSubmission[]>(
    `/api/schedule/lessons/${lessonId}/material-submissions`,
    { method: "GET" },
    config,
  );
}

export async function fetchScheduledLessonMaterialAnnotation(
  lessonId: string,
  config = authConfig,
): Promise<LessonMaterialAnnotation | null> {
  try {
    return await apiJson<LessonMaterialAnnotation>(
      `/api/schedule/lessons/${lessonId}/material-annotation`,
      { method: "GET" },
      config,
    );
  } catch (caught) {
    if (isApiStatus(caught, 404)) {
      return null;
    }
    throw caught;
  }
}

export async function saveScheduledLessonMaterialAnnotation(
  lessonId: string,
  input: LessonMaterialAnnotationInput,
  config = authConfig,
): Promise<LessonMaterialAnnotation> {
  return apiJson<LessonMaterialAnnotation>(
    `/api/schedule/lessons/${lessonId}/material-annotation`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
    config,
  );
}

export async function saveScheduledLessonMaterialSubmission(
  lessonId: string,
  input: LessonMaterialSubmissionInput,
  config = authConfig,
): Promise<LessonMaterialSubmission> {
  return apiJson<LessonMaterialSubmission>(
    `/api/schedule/lessons/${lessonId}/material-submission`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
    config,
  );
}
