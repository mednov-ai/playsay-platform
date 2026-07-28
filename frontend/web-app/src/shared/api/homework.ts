import { authConfig } from "./auth";
import { apiJson } from "./http";
import type {
  HomeworkAssignment,
  HomeworkAssignmentDetail,
  HomeworkAssignmentInput,
  HomeworkSubmission,
  LessonHomeworkInput,
  LessonMaterialSubmissionInput,
  StudentHomeworkDetail,
  StudentVocabularyHomeworkDetail,
  VocabularyHomeworkInput,
} from "./types";

export async function fetchHomeworkAssignments(config = authConfig): Promise<HomeworkAssignment[]> {
  return apiJson<HomeworkAssignment[]>("/api/assignments", { method: "GET" }, config);
}

export async function fetchHomeworkAssignment(
  assignmentId: string,
  config = authConfig,
): Promise<HomeworkAssignmentDetail> {
  return apiJson<HomeworkAssignmentDetail>(`/api/assignments/${assignmentId}`, { method: "GET" }, config);
}

export async function createHomeworkAssignment(
  input: HomeworkAssignmentInput,
  config = authConfig,
): Promise<HomeworkAssignmentDetail> {
  return apiJson<HomeworkAssignmentDetail>(
    "/api/assignments",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    config,
    201,
  );
}

export async function createHomeworkFromScheduledLesson(
  lessonId: string,
  input: LessonHomeworkInput = {},
  config = authConfig,
): Promise<HomeworkAssignmentDetail> {
  return apiJson<HomeworkAssignmentDetail>(
    `/api/schedule/lessons/${lessonId}/homework`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    config,
    201,
  );
}

export async function createVocabularyHomeworkAssignment(
  input: VocabularyHomeworkInput,
  config = authConfig,
): Promise<HomeworkAssignmentDetail> {
  return apiJson<HomeworkAssignmentDetail>(
    "/api/assignments/vocabulary",
    { method: "POST", body: JSON.stringify(input) },
    config,
    201,
  );
}

export async function fetchMyHomeworkAssignments(config = authConfig): Promise<HomeworkAssignment[]> {
  return apiJson<HomeworkAssignment[]>("/api/me/assignments", { method: "GET" }, config);
}

export async function fetchMyHomeworkAssignment(
  assignmentId: string,
  config = authConfig,
): Promise<StudentHomeworkDetail> {
  return apiJson<StudentHomeworkDetail>(`/api/me/assignments/${assignmentId}`, { method: "GET" }, config);
}

export async function fetchMyVocabularyHomeworkAssignment(
  assignmentId: string,
  config = authConfig,
): Promise<StudentVocabularyHomeworkDetail> {
  return apiJson<StudentVocabularyHomeworkDetail>(
    `/api/me/assignments/${assignmentId}/vocabulary`,
    { method: "GET" },
    config,
  );
}

export async function saveMyHomeworkAssignmentSubmission(
  assignmentId: string,
  input: LessonMaterialSubmissionInput,
  config = authConfig,
): Promise<HomeworkSubmission> {
  return apiJson<HomeworkSubmission>(
    `/api/me/assignments/${assignmentId}/submission`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
    config,
  );
}
