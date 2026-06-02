import { authConfig } from "./auth";
import { isApiStatus } from "./errors";
import { apiJson } from "./http";
import type {
  CollaborationDocument,
  CollaborationDocumentToken,
  CreateCollaborationDocumentInput,
  FinalizeCollaborationDocumentInput,
  LessonMaterialSubmission,
  SaveCollaborationSnapshotInput,
} from "./types";

export async function fetchCurrentCollaborationDocument(
  lessonId: string,
  input: Required<Pick<CreateCollaborationDocumentInput, "materialId" | "scope">> & { documentKind?: string },
  config = authConfig,
): Promise<CollaborationDocument | null> {
  const params = new URLSearchParams({
    materialId: input.materialId,
    documentKind: input.documentKind ?? "MATERIAL_WORK",
    scope: input.scope,
  });
  try {
    return await apiJson<CollaborationDocument>(
      `/api/schedule/lessons/${lessonId}/collaboration-documents/current?${params.toString()}`,
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

export async function createCurrentCollaborationDocument(
  lessonId: string,
  input: CreateCollaborationDocumentInput,
  config = authConfig,
): Promise<CollaborationDocument> {
  return apiJson<CollaborationDocument>(
    `/api/schedule/lessons/${lessonId}/collaboration-documents/current`,
    {
      method: "POST",
      body: JSON.stringify({
        documentKind: input.documentKind ?? "MATERIAL_WORK",
        materialId: input.materialId,
        scope: input.scope ?? "INDIVIDUAL",
      }),
    },
    config,
  );
}

export async function fetchCollaborationDocuments(
  lessonId: string,
  materialId: string,
  config = authConfig,
): Promise<CollaborationDocument[]> {
  const params = new URLSearchParams({ materialId });
  return apiJson<CollaborationDocument[]>(
    `/api/schedule/lessons/${lessonId}/collaboration-documents?${params.toString()}`,
    { method: "GET" },
    config,
  );
}

export async function saveCollaborationDocumentSnapshot(
  lessonId: string,
  documentId: string,
  input: SaveCollaborationSnapshotInput,
  config = authConfig,
): Promise<CollaborationDocument> {
  return apiJson<CollaborationDocument>(
    `/api/schedule/lessons/${lessonId}/collaboration-documents/${documentId}/snapshot`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
    config,
  );
}

export async function finalizeCollaborationDocument(
  lessonId: string,
  documentId: string,
  input: FinalizeCollaborationDocumentInput = {},
  config = authConfig,
): Promise<LessonMaterialSubmission> {
  return apiJson<LessonMaterialSubmission>(
    `/api/schedule/lessons/${lessonId}/collaboration-documents/${documentId}/finalize`,
    {
      method: "POST",
      body: JSON.stringify({ submitted: input.submitted ?? true }),
    },
    config,
  );
}

export async function createCollaborationDocumentToken(
  lessonId: string,
  documentId: string,
  config = authConfig,
): Promise<CollaborationDocumentToken> {
  return apiJson<CollaborationDocumentToken>(
    `/api/schedule/lessons/${lessonId}/collaboration-documents/${documentId}/token`,
    { method: "POST" },
    config,
  );
}
