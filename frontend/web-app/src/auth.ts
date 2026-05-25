import {
  createCourse,
  createCourseLesson,
  createScheduledLessonRoomToken,
  createScheduledLesson,
  deleteMyUserProfile,
  deleteCourse,
  deleteCourseLesson,
  deleteScheduledLesson,
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
} from "./generated/playsay-api";

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
export type LessonMaterialGenerateImagesInput = {
  blockId?: string | null;
  maxImages?: number | null;
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

export const authConfig: AuthConfig = {
  issuer:
    import.meta.env.VITE_AUTH_ISSUER ??
    "https://ops.play-and-say.ru:18443/keycloak/realms/playsay",
  clientId: import.meta.env.VITE_AUTH_CLIENT_ID ?? "playsay-web",
  redirectPath: import.meta.env.VITE_AUTH_REDIRECT_PATH ?? "/auth/callback",
};

const tokenStorageKey = "playsay.auth.tokens";
const flowStorageKey = "playsay.auth.loginFlow";
const expirySkewMs = 30_000;

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
}

export async function startLogin(config = authConfig): Promise<void> {
  const redirectUri = getRedirectUri(config);
  const codeVerifier = createCodeVerifier();
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const state = createCodeVerifier();
  const flow: LoginFlow = { codeVerifier, state, redirectUri };

  window.sessionStorage.setItem(flowStorageKey, JSON.stringify(flow));
  window.location.assign(
    buildAuthorizeUrl({
      config,
      redirectUri,
      state,
      codeChallenge,
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
  const flow = readLoginFlow();
  if (!code || !state || !flow || state !== flow.state) {
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
  return tokens;
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
    throw new Error(`Profile request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchUserProfile(config = authConfig): Promise<AppUserProfile> {
  const response = await getMyUserProfile(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw new Error(`User profile request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchAdminUserProfiles(config = authConfig): Promise<AdminUserProfile[]> {
  const response = await listUserProfiles(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw new Error(`Admin users request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchStudentProfiles(config = authConfig): Promise<AdminUserProfile[]> {
  const response = await listStudentProfiles(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw new Error(`Student profiles request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchCourses(config = authConfig): Promise<Course[]> {
  const response = await listCourses(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw new Error(`Courses request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchCourseLessons(courseId: string, config = authConfig): Promise<CourseLesson[]> {
  const response = await listCourseLessons(courseId, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw new Error(`Course lessons request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function saveCourse(input: CourseInput, config = authConfig): Promise<Course> {
  const response = await createCourse(input, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 201) {
    throw new Error(`Course create failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function removeCourse(courseId: string, config = authConfig): Promise<void> {
  const response = await deleteCourse(courseId, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 204) {
    throw new Error(`Course delete failed with HTTP ${response.status}.`);
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
    throw new Error(`Course lesson create failed with HTTP ${response.status}.`);
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
    throw new Error(`Course lesson update failed with HTTP ${response.status}.`);
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
    throw new Error(`Course lesson delete failed with HTTP ${response.status}.`);
  }
}

export async function fetchScheduledLessons(config = authConfig): Promise<ScheduledLesson[]> {
  const response = await listScheduledLessons(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw new Error(`Schedule request failed with HTTP ${response.status}.`);
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
    throw new Error(`Scheduled lesson create failed with HTTP ${response.status}.`);
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
    throw new Error(`Scheduled lesson update failed with HTTP ${response.status}.`);
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

export async function fetchMaterialAssets(
  materialId: string,
  config = authConfig,
): Promise<LessonMaterialAsset[]> {
  return apiJson<LessonMaterialAsset[]>(`/api/materials/${materialId}/assets`, { method: "GET" }, config);
}

export async function fetchScheduledLessonMaterial(
  lessonId: string,
  config = authConfig,
): Promise<LessonMaterial | null> {
  try {
    return await apiJson<LessonMaterial>(`/api/schedule/lessons/${lessonId}/material`, { method: "GET" }, config);
  } catch (caught) {
    if (caught instanceof Error && caught.message.includes("HTTP 404")) {
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
    if (caught instanceof Error && caught.message.includes("HTTP 404")) {
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
    if (caught instanceof Error && caught.message.includes("HTTP 404")) {
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

export async function removeScheduledLesson(lessonId: string, config = authConfig): Promise<void> {
  const response = await deleteScheduledLesson(lessonId, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 204) {
    throw new Error(`Scheduled lesson delete failed with HTTP ${response.status}.`);
  }
}

export async function enterScheduledLessonRoom(lessonId: string, config = authConfig): Promise<LiveKitRoomToken> {
  const response = await createScheduledLessonRoomToken(lessonId, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw new Error(`Video room token request failed with HTTP ${response.status}.`);
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
    throw new Error(`User profile update failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function resetUserProfile(config = authConfig): Promise<void> {
  const response = await deleteMyUserProfile(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 204) {
    throw new Error(`User profile reset failed with HTTP ${response.status}.`);
  }
}

async function authorizedOptions(config: AuthConfig): Promise<RequestInit> {
  const accessToken = await getValidAccessToken(config);
  if (!accessToken) {
    throw new Error("Not authenticated.");
  }

  return {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };
}

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
    throw new Error(`API request ${path} failed with HTTP ${response.status}.`);
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
}): URL {
  const url = new URL(`${trimTrailingSlash(input.config.issuer)}/protocol/openid-connect/auth`);
  url.searchParams.set("client_id", input.config.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
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

function writeTokens(tokens: TokenSet): void {
  window.sessionStorage.setItem(tokenStorageKey, JSON.stringify(tokens));
}

async function parseTokenResponse(response: Response): Promise<TokenSet> {
  if (!response.ok) {
    throw new Error(`Token request failed with HTTP ${response.status}.`);
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
