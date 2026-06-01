import {
  createCourse,
  createCourseLesson,
  createScheduledLessonRoomToken,
  createScheduledLesson,
  deleteMyUserProfile,
  deleteCourse,
  deleteCourseLesson,
  deleteScheduledLesson,
  getScheduledLesson,
  getMe,
  getMyUserProfile,
  listCourseLessons,
  listCourses,
  listScheduledLessons,
  listStudentProfiles,
  listUserProfiles,
  updateCourseLesson,
  updateScheduledLesson,
  updateMyUserProfile,
  type CourseLessonRequest,
  type CourseLessonResponse,
  type CourseRequest,
  type CourseResponse,
  type LiveKitRoomTokenResponse,
  type MeResponse,
  type ScheduledLessonRequest,
  type ScheduledLessonResponse,
  type UpdateUserProfileRequest,
  type UserProfileResponse,
} from "../../generated/playsay-api";
import { i18n, normalizeLanguage, rememberPendingLoginLanguage } from "../i18n";

export type AuthConfig = {
  issuer: string;
  clientId: string;
  redirectPath: string;
};

export type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number;
};

export type MeProfile = MeResponse;
export type AppUserProfile = UserProfileResponse;
export type UpdateUserProfileInput = UpdateUserProfileRequest;
export type AdminUserProfile = UserProfileResponse;
export type Course = CourseResponse;
export type CourseLesson = CourseLessonResponse & {
  materialId?: string | null;
  materialTitle?: string | null;
};
export type CourseInput = CourseRequest;
export type CourseLessonInput = CourseLessonRequest & {
  materialId?: string | null;
};
export type ScheduledLesson = ScheduledLessonResponse & {
  materialId?: string | null;
  materialTitle?: string | null;
};
export type ScheduledLessonInput = ScheduledLessonRequest & {
  materialId?: string | null;
};
export type LiveKitRoomToken = LiveKitRoomTokenResponse;
export type LessonMaterialJson = Record<string, unknown>;
export type LessonMaterial = {
  id: string;
  ownerTeacherUserId?: string | null;
  ownerTeacherSubject?: string | null;
  ownerTeacherName?: string | null;
  title: string;
  description?: string | null;
  language: string;
  cefrLevel: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | string;
  visibility: "PRIVATE" | "PUBLIC" | string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED" | string;
  document: LessonMaterialJson;
  sourceMeta: LessonMaterialJson;
  scoringRubric: LessonMaterialJson;
  blockCount: number;
  createdAt: string;
  updatedAt: string;
};
export type LessonMaterialAsset = {
  id: string;
  materialId: string;
  kind: string;
  storageKey?: string | null;
  externalUrl?: string | null;
  contentUrl?: string | null;
  provider: string;
  metadata: LessonMaterialJson;
  createdAt: string;
};
export type LessonMaterialInput = {
  title: string;
  description?: string | null;
  language?: string;
  cefrLevel?: string;
  visibility?: "PRIVATE" | "PUBLIC" | string;
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED" | string;
  document?: LessonMaterialJson;
  sourceMeta?: LessonMaterialJson;
  scoringRubric?: LessonMaterialJson;
};
export type LessonMaterialDraftInput = {
  title?: string | null;
  prompt: string;
  language?: string;
  cefrLevel?: string | null;
  sourceImageDataUrl?: string | null;
  sourceFileName?: string | null;
};
export type LessonMaterialUrlDraftInput = {
  url: string;
  title?: string | null;
  prompt?: string | null;
  language?: string;
  cefrLevel?: string | null;
};
export type LessonMaterialGenerateImagesInput = {
  blockId?: string | null;
  maxImages?: number | null;
  regenerate?: boolean | null;
};
export type LessonMaterialAnswerSuggestionsInput = {
  blockId: string;
  itemIds?: string[];
};
export type LessonMaterialAnswerSuggestion = {
  value: string;
  reason: string;
  confidence: number;
};
export type LessonMaterialAnswerSuggestionItem = {
  itemId: string;
  prompt: string;
  answer?: string | null;
  suggestions: LessonMaterialAnswerSuggestion[];
};
export type LessonMaterialAnswerSuggestions = {
  materialId: string;
  blockId: string;
  items: LessonMaterialAnswerSuggestionItem[];
};
export type LessonMaterialAssetUpdateInput = {
  tags?: string[] | null;
};
export type LessonMaterialDraft = Omit<LessonMaterialInput, "title"> & {
  title: string;
  description?: string | null;
  language: string;
  cefrLevel: string;
  visibility: string;
  status: string;
  document: LessonMaterialJson;
  sourceMeta: LessonMaterialJson;
  scoringRubric: LessonMaterialJson;
};
export type LessonMaterialSubmission = {
  id: string;
  assignmentId: string;
  lessonId: string;
  materialId: string;
  userId: string;
  userSubject?: string | null;
  userName?: string | null;
  content: LessonMaterialJson;
  score?: number | null;
  errorsCount?: number | null;
  submittedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
export type LessonMaterialSubmissionInput = {
  content: LessonMaterialJson;
  submitted?: boolean;
};
export type HomeworkAssignmentInput = {
  dueAt?: string | null;
  instructions?: string | null;
  materialId: string;
  studentSubjects: string[];
  title?: string | null;
};
export type LessonHomeworkInput = {
  dueAt?: string | null;
  instructions?: string | null;
  studentSubjects?: string[] | null;
  title?: string | null;
};
export type HomeworkAssignment = {
  id: string;
  materialId: string;
  materialTitle: string;
  lessonId?: string | null;
  sourceLessonId?: string | null;
  title: string;
  instructions?: string | null;
  type: string;
  maxScore?: number | null;
  dueAt?: string | null;
  status: string;
  recipientCount: number;
  submittedCount: number;
  scoredCount: number;
  averageScore?: number | null;
  averageErrorsCount?: number | null;
  createdAt: string;
  updatedAt: string;
};
export type HomeworkRecipientProgress = {
  assignmentId: string;
  studentUserId: string;
  studentSubject: string;
  studentName?: string | null;
  submissionId?: string | null;
  hasSubmission: boolean;
  submitted: boolean;
  score?: number | null;
  maxScore?: number | null;
  scoreRatio?: number | null;
  errorsCount?: number | null;
  progressTone?: number | null;
  showGroupIndicator: boolean;
  groupAverageScore?: number | null;
  groupAverageErrorsCount?: number | null;
  relativeScoreDelta?: number | null;
  relativeErrorsDelta?: number | null;
  submittedAt?: string | null;
  updatedAt?: string | null;
};
export type HomeworkAssignmentDetail = {
  assignment: HomeworkAssignment;
  recipients: HomeworkRecipientProgress[];
};
export type HomeworkSubmission = Omit<LessonMaterialSubmission, "lessonId"> & {
  lessonId?: string | null;
  progressTone?: number | null;
};
export type StudentHomeworkDetail = {
  assignment: HomeworkAssignment;
  material: LessonMaterial;
  submission: HomeworkSubmission;
};
export type LessonMaterialAnnotation = {
  id: string;
  lessonId: string;
  materialId: string;
  content: LessonMaterialJson;
  createdAt: string;
  updatedAt: string;
};
export type LessonMaterialAnnotationInput = {
  content: LessonMaterialJson;
};
export type CollaborationDocumentScope = "INDIVIDUAL" | "GROUP";
export type CollaborationDocument = {
  id: string;
  lessonId: string;
  materialId: string;
  studentUserId?: string | null;
  studentSubject?: string | null;
  studentName?: string | null;
  documentKind: string;
  scope: CollaborationDocumentScope | string;
  yjsDocumentId: string;
  snapshot?: LessonMaterialJson | null;
  snapshotStorageKey?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type CreateCollaborationDocumentInput = {
  materialId: string;
  documentKind?: string;
  scope?: CollaborationDocumentScope;
};
export type SaveCollaborationSnapshotInput = {
  snapshot: LessonMaterialJson;
  snapshotStorageKey?: string | null;
};
export type FinalizeCollaborationDocumentInput = {
  submitted?: boolean;
};
export type CollaborationDocumentToken = {
  documentId: string;
  yjsDocumentId: string;
  websocketUrl: string;
  token: string;
  expiresAt: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
};

type LoginFlow = {
  codeVerifier: string;
  state: string;
  redirectUri: string;
};

type CompletedLoginFlow = {
  clientId: string;
  code: string;
  redirectUri: string;
  state: string;
};

export const authConfig: AuthConfig = {
  issuer:
    import.meta.env.VITE_AUTH_ISSUER ??
    "https://ops.play-and-say.ru:18443/keycloak/realms/playsay",
  clientId: import.meta.env.VITE_AUTH_CLIENT_ID ?? "playsay-web",
  redirectPath: import.meta.env.VITE_AUTH_REDIRECT_PATH ?? "/auth/callback",
};

const tokenStorageKey = "playsay.auth.tokens";
const flowStorageKey = "playsay.auth.loginFlow";
const completedFlowStorageKey = "playsay.auth.completedLoginFlow";
const expirySkewMs = 30_000;
const loginCompletionRequests = new Map<string, Promise<TokenSet>>();

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

export function isAuthCallback(url: URL): boolean {
  return url.pathname === authConfig.redirectPath && (url.searchParams.has("code") || url.searchParams.has("error"));
}

export function readTokens(): TokenSet | null {
  const value = window.sessionStorage.getItem(tokenStorageKey);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as TokenSet;
  } catch {
    clearTokens();
    return null;
  }
}

export function clearTokens(): void {
  window.sessionStorage.removeItem(tokenStorageKey);
  window.sessionStorage.removeItem(flowStorageKey);
  window.sessionStorage.removeItem(completedFlowStorageKey);
}

export async function startLogin(config = authConfig): Promise<void> {
  const redirectUri = getRedirectUri(config);
  const codeVerifier = createCodeVerifier();
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const state = createCodeVerifier();
  const language = currentApiLanguage();
  const flow: LoginFlow = { codeVerifier, state, redirectUri };

  rememberPendingLoginLanguage(language);
  window.sessionStorage.setItem(flowStorageKey, JSON.stringify(flow));
  window.location.assign(
    buildAuthorizeUrl({
      config,
      redirectUri,
      state,
      codeChallenge,
      uiLocales: language,
    }).toString(),
  );
}

export async function completeLogin(url: URL, config = authConfig): Promise<TokenSet> {
  const error = url.searchParams.get("error");
  if (error) {
    throw new Error(url.searchParams.get("error_description") ?? error);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    throw new Error("Auth callback state is invalid.");
  }

  if (isCompletedLoginFlow(readCompletedLoginFlow(), config, code, state)) {
    const existingTokens = readTokens();
    if (existingTokens) {
      return existingTokens;
    }
  }

  const completionKey = `${config.clientId}:${state}:${code}`;
  const inFlightCompletion = loginCompletionRequests.get(completionKey);
  if (inFlightCompletion) {
    return inFlightCompletion;
  }

  const completion = exchangeLoginCode(config, code, state);
  loginCompletionRequests.set(completionKey, completion);

  try {
    return await completion;
  } finally {
    loginCompletionRequests.delete(completionKey);
  }
}

export async function getValidAccessToken(config = authConfig): Promise<string | null> {
  const tokens = readTokens();
  if (!tokens) {
    return null;
  }

  if (tokens.expiresAt > Date.now() + expirySkewMs) {
    return tokens.accessToken;
  }

  if (!tokens.refreshToken) {
    clearTokens();
    return null;
  }

  const response = await fetch(`${trimTrailingSlash(config.issuer)}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      refresh_token: tokens.refreshToken,
    }),
  });

  if (!response.ok) {
    clearTokens();
    return null;
  }

  const refreshed = await parseTokenResponse(response);
  writeTokens(refreshed);
  return refreshed.accessToken;
}

export async function fetchMe(config = authConfig): Promise<MeProfile> {
  const response = await getMe(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Profile request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchUserProfile(config = authConfig): Promise<AppUserProfile> {
  const response = await getMyUserProfile(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `User profile request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchAdminUserProfiles(config = authConfig): Promise<AdminUserProfile[]> {
  const response = await listUserProfiles(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Admin users request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchStudentProfiles(config = authConfig): Promise<AdminUserProfile[]> {
  const response = await listStudentProfiles(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Student profiles request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchCourses(config = authConfig): Promise<Course[]> {
  const response = await listCourses(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Courses request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchCourseLessons(courseId: string, config = authConfig): Promise<CourseLesson[]> {
  const response = await listCourseLessons(courseId, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Course lessons request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function saveCourse(input: CourseInput, config = authConfig): Promise<Course> {
  const response = await createCourse(input, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 201) {
    throw apiErrorFromData(response.status, response.data as unknown, `Course create failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function removeCourse(courseId: string, config = authConfig): Promise<void> {
  const response = await deleteCourse(courseId, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 204) {
    throw apiErrorFromData(response.status, response.data as unknown, `Course delete failed with HTTP ${response.status}.`);
  }
}

export async function saveCourseLesson(
  courseId: string,
  input: CourseLessonInput,
  config = authConfig,
): Promise<CourseLesson> {
  const response = await createCourseLesson(courseId, input as CourseLessonRequest, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 201) {
    throw apiErrorFromData(response.status, response.data as unknown, `Course lesson create failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function editCourseLesson(
  courseId: string,
  lessonId: string,
  input: CourseLessonInput,
  config = authConfig,
): Promise<CourseLesson> {
  const response = await updateCourseLesson(courseId, lessonId, input as CourseLessonRequest, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Course lesson update failed with HTTP ${response.status}.`);
  }

  return response.data as CourseLesson;
}

export async function removeCourseLesson(
  courseId: string,
  lessonId: string,
  config = authConfig,
): Promise<void> {
  const response = await deleteCourseLesson(courseId, lessonId, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 204) {
    throw apiErrorFromData(response.status, response.data as unknown, `Course lesson delete failed with HTTP ${response.status}.`);
  }
}

export async function fetchScheduledLessons(config = authConfig): Promise<ScheduledLesson[]> {
  const response = await listScheduledLessons(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Schedule request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchScheduledLesson(
  lessonId: string,
  config = authConfig,
): Promise<ScheduledLesson> {
  const response = await getScheduledLesson(lessonId, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Scheduled lesson request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function saveScheduledLesson(
  input: ScheduledLessonInput,
  config = authConfig,
): Promise<ScheduledLesson> {
  const response = await createScheduledLesson(input as ScheduledLessonRequest, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 201) {
    throw apiErrorFromData(response.status, response.data as unknown, `Scheduled lesson create failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function editScheduledLesson(
  lessonId: string,
  input: ScheduledLessonInput,
  config = authConfig,
): Promise<ScheduledLesson> {
  const response = await updateScheduledLesson(lessonId, input as ScheduledLessonRequest, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Scheduled lesson update failed with HTTP ${response.status}.`);
  }

  return response.data;
}

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

export async function fetchMyHomeworkAssignments(config = authConfig): Promise<HomeworkAssignment[]> {
  return apiJson<HomeworkAssignment[]>("/api/me/assignments", { method: "GET" }, config);
}

export async function fetchMyHomeworkAssignment(
  assignmentId: string,
  config = authConfig,
): Promise<StudentHomeworkDetail> {
  return apiJson<StudentHomeworkDetail>(`/api/me/assignments/${assignmentId}`, { method: "GET" }, config);
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

export async function removeScheduledLesson(lessonId: string, config = authConfig): Promise<void> {
  const response = await deleteScheduledLesson(lessonId, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 204) {
    throw apiErrorFromData(response.status, response.data as unknown, `Scheduled lesson delete failed with HTTP ${response.status}.`);
  }
}

export async function enterScheduledLessonRoom(lessonId: string, config = authConfig): Promise<LiveKitRoomToken> {
  const response = await createScheduledLessonRoomToken(lessonId, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Video room token request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function saveUserProfile(
  input: UpdateUserProfileInput,
  config = authConfig,
): Promise<AppUserProfile> {
  const response = await updateMyUserProfile(input, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `User profile update failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function resetUserProfile(config = authConfig): Promise<void> {
  const response = await deleteMyUserProfile(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 204) {
    throw apiErrorFromData(response.status, response.data as unknown, `User profile reset failed with HTTP ${response.status}.`);
  }
}

async function authorizedOptions(config: AuthConfig): Promise<RequestInit> {
  const accessToken = await getValidAccessToken(config);
  if (!accessToken) {
    throw new Error("Not authenticated.");
  }

  return {
    headers: {
      "Accept-Language": currentApiLanguage(),
      Authorization: `Bearer ${accessToken}`,
    },
  };
}

function currentApiLanguage(): string {
  return normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);
}

function apiErrorFromData(status: number, data: unknown, fallbackMessage: string): ApiError {
  if (isProjectErrorBody(data)) {
    return new ApiError(
      status,
      data.errorCode ?? fallbackErrorCode,
      data.message?.trim() || fallbackMessage,
    );
  }

  return new ApiError(status, fallbackErrorCode, fallbackMessage);
}

async function apiErrorFromResponse(response: Response, fallbackMessage: string): Promise<ApiError> {
  const body = await response.text().catch(() => "");
  const data = body ? safeJsonParse(body) : null;
  return apiErrorFromData(response.status, data, fallbackMessage);
}

function isApiStatus(caught: unknown, status: number): boolean {
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

async function apiJson<T>(
  path: string,
  init: RequestInit,
  config: AuthConfig,
  expectedStatus = 200,
): Promise<T> {
  const authorized = await authorizedOptions(config);
  const response = await fetch(path, {
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
    throw await apiErrorFromResponse(response, `API request ${path} failed with HTTP ${response.status}.`);
  }

  if (expectedStatus === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function buildLogoutUrl(config = authConfig): string {
  const tokens = readTokens();
  const url = new URL(`${trimTrailingSlash(config.issuer)}/protocol/openid-connect/logout`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("post_logout_redirect_uri", window.location.origin);
  if (tokens?.idToken) {
    url.searchParams.set("id_token_hint", tokens.idToken);
  }
  return url.toString();
}

export function buildAuthorizeUrl(input: {
  config: AuthConfig;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  uiLocales?: string;
}): URL {
  const url = new URL(`${trimTrailingSlash(input.config.issuer)}/protocol/openid-connect/auth`);
  url.searchParams.set("client_id", input.config.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (input.uiLocales) {
    url.searchParams.set("ui_locales", normalizeLanguage(input.uiLocales));
  }
  return url;
}

export function mapTokenResponse(response: TokenResponse, now = Date.now()): TokenSet {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    idToken: response.id_token,
    expiresAt: now + response.expires_in * 1000,
  };
}

function getRedirectUri(config: AuthConfig): string {
  return `${window.location.origin}${config.redirectPath}`;
}

function readLoginFlow(): LoginFlow | null {
  const value = window.sessionStorage.getItem(flowStorageKey);
  if (!value) {
    return null;
  }
  return JSON.parse(value) as LoginFlow;
}

async function exchangeLoginCode(config: AuthConfig, code: string, state: string): Promise<TokenSet> {
  const flow = readLoginFlow();
  if (!flow || state !== flow.state) {
    throw new Error("Auth callback state is invalid.");
  }

  const response = await fetch(`${trimTrailingSlash(config.issuer)}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      redirect_uri: flow.redirectUri,
      code,
      code_verifier: flow.codeVerifier,
    }),
  });

  const tokens = await parseTokenResponse(response);
  window.sessionStorage.removeItem(flowStorageKey);
  writeTokens(tokens);
  writeCompletedLoginFlow({
    clientId: config.clientId,
    code,
    redirectUri: flow.redirectUri,
    state,
  });
  return tokens;
}

function readCompletedLoginFlow(): CompletedLoginFlow | null {
  const value = window.sessionStorage.getItem(completedFlowStorageKey);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as CompletedLoginFlow;
  } catch {
    window.sessionStorage.removeItem(completedFlowStorageKey);
    return null;
  }
}

function writeCompletedLoginFlow(flow: CompletedLoginFlow): void {
  window.sessionStorage.setItem(completedFlowStorageKey, JSON.stringify(flow));
}

function isCompletedLoginFlow(
  flow: CompletedLoginFlow | null,
  config: AuthConfig,
  code: string,
  state: string,
): boolean {
  return Boolean(
    flow &&
    flow.clientId === config.clientId &&
    flow.code === code &&
    flow.redirectUri === getRedirectUri(config) &&
    flow.state === state
  );
}

function writeTokens(tokens: TokenSet): void {
  window.sessionStorage.setItem(tokenStorageKey, JSON.stringify(tokens));
}

async function parseTokenResponse(response: Response): Promise<TokenSet> {
  if (!response.ok) {
    throw await apiErrorFromResponse(response, `Token request failed with HTTP ${response.status}.`);
  }

  return mapTokenResponse((await response.json()) as TokenResponse);
}

function createCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const bytes = new TextEncoder().encode(verifier);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
