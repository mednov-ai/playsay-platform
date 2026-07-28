import type {
  CourseLessonRequest,
  CourseLessonResponse,
  CourseRequest,
  CourseResponse,
  CurriculumTopicRequest,
  CurriculumTopicResponse,
  LessonTemplateCardRequest,
  LessonTemplateCardsRequest,
  LessonTranslationSessionResponse,
  LiveKitRoomTokenResponse,
  MeResponse,
  ScheduledLessonMaterialAssignmentRequest,
  ScheduledLessonRequest,
  ScheduledLessonResponse,
  ScheduledLessonScheduleUpdateRequest,
  UpdateUserProfileRequest,
  UserProfileResponse,
} from "../../generated/playsay-api";

export type MeProfile = MeResponse;
export type AppUserProfile = UserProfileResponse & {
  countryCode?: string | null;
  managedByTeacher?: boolean;
};
export type UpdateUserProfileInput = UpdateUserProfileRequest & {
  countryCode?: string | null;
};
export type AdminUserProfile = UserProfileResponse & {
  managedByTeacher?: boolean;
};
export type ManagedStudentInput = {
  username: string;
  firstName: string;
  lastName?: string;
  email?: string;
};
export type Course = CourseResponse;
export type CourseLesson = CourseLessonResponse & {
  materialId?: string | null;
  materialTitle?: string | null;
};
export type CourseInput = CourseRequest;
export type CourseLessonInput = CourseLessonRequest & {
  materialId?: string | null;
};
export type CurriculumTopic = CurriculumTopicResponse;
export type CurriculumTopicInput = CurriculumTopicRequest;
export type LessonTemplateCardInput = LessonTemplateCardRequest;
export type LessonTemplateCardsInput = LessonTemplateCardsRequest;
export type ScheduledLesson = ScheduledLessonResponse & {
  materialId?: string | null;
  materialTitle?: string | null;
};
export type ScheduledLessonParticipantLink = {
  subject: string;
  displayName?: string | null;
  email?: string | null;
  url: string;
  expiresAt?: string | null;
  mode: "MAGIC_LINK" | "AUTHENTICATED_LINK" | string;
};
export type ScheduledLessonParticipantLinks = {
  lessonId: string;
  links: ScheduledLessonParticipantLink[];
};
export type ScheduledLessonMaterialAssignmentInput = ScheduledLessonMaterialAssignmentRequest;
export type ScheduledLessonRecurrenceInput = {
  mode: "WEEKLY_COUNT" | "WEEKLY_BY_WEEK";
  count: number;
  weekdays: string[];
  weekdayTimes?: Record<string, string>;
  timeZone: string;
};
export type ScheduledLessonInput = ScheduledLessonRequest & {
  materialId?: string | null;
  recurrence?: ScheduledLessonRecurrenceInput | null;
};
export type ScheduledLessonScheduleInput = ScheduledLessonScheduleUpdateRequest;
export type LiveKitRoomToken = LiveKitRoomTokenResponse;
export type LessonTranslationSession = LessonTranslationSessionResponse;
export type StudentInviteAuthenticatedResult = {
  status?: "AUTHENTICATED";
  accessToken: string;
  refreshToken?: string | null;
  idToken?: string | null;
  expiresIn: number;
  continueUrl: string;
};
export type StudentInviteWaitingResult = {
  status: "WAITING";
  opensAt: string;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  retryAfterSeconds?: number | null;
  continueUrl?: string | null;
};
export type StudentInviteConsumeResult = StudentInviteAuthenticatedResult | StudentInviteWaitingResult;
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
  topicTags?: string[];
  skillTags?: string[];
  ageBand?: string | null;
  estimatedDurationMin?: number | null;
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
export type MaterialImagePageResult = {
  material: LessonMaterial;
  activePageId: string;
};
export type LiveLessonImagePageResult = MaterialImagePageResult & {
  lesson: ScheduledLesson;
};
export type LiveLessonHtmlGamePageResult = LiveLessonImagePageResult;
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
  topicTags?: string[];
  skillTags?: string[];
  ageBand?: string | null;
  estimatedDurationMin?: number | null;
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
export type MaterialVideoPlaybackInput = {
  blockId: string;
  quality?: "LOW" | "MEDIUM" | "HIGH" | string | null;
};
export type MaterialExternalActivityResolution = {
  normalizedUrl: string;
  provider: "LIVEWORKSHEETS" | "WORDWALL" | "ISLCOLLECTIVE" | "TOPWORKSHEETS" | "JEOPARDYLABS" | "EXPERIMENTAL";
  supportLevel: "GUARANTEED" | "EXPERIMENTAL";
  host: string;
  warningCode?: string | null;
};
export type MaterialVideoPlayback = {
  materialId: string;
  blockId: string;
  videoId?: string | null;
  mode: "EMBED" | "RF_RELAY" | "BLOCKED" | "NEEDS_REVIEW" | string;
  reason?: string | null;
  embedUrl?: string | null;
  relayUrl?: string | null;
  sessionId?: string | null;
  expiresAt?: string | null;
  requestedQuality?: "LOW" | "MEDIUM" | "HIGH" | string | null;
  selectedQuality?: "LOW" | "MEDIUM" | "HIGH" | string | null;
  selectedHeight?: number | null;
  thumbnailUrl?: string | null;
  thumbnailAssetId?: string | null;
};
export type LessonMaterialAssetUpdateInput = {
  tags?: string[] | null;
};
export type MaterialHtmlGameEnrichment = {
  assetId: string;
  blockId: string;
  status: "IDLE" | "PENDING" | "RUNNING" | "RETRY" | "READY" | "FAILED" | string;
  title?: string | null;
  titleSource?: "FILE" | "HTML" | "AI" | "USER" | string | null;
  iconAssetId?: string | null;
  gameIconUrl?: string | null;
  errorCode?: string | null;
};
export type MaterialHtmlGameEnrichmentInput = {
  blockId: string;
  preferredTitle?: string | null;
  regenerateIcon?: boolean | null;
};
export type MaterialGameAdaptation = {
  id: string;
  materialId: string;
  sourceAssetId: string;
  adaptedAssetId?: string | null;
  blockId: string;
  status: "PENDING" | "ANALYZING" | "PATCHING" | "VALIDATING" | "READY_FOR_REVIEW" | "APPLIED" | "ROLLED_BACK" | "RETRY" | "FAILED" | string;
  compatibility: "SDK_V1" | "LEGACY_PREDICTIVE" | "LEGACY_MIRROR" | "UNSUPPORTED" | string;
  report?: string | null;
  model?: string | null;
  errorCode?: string | null;
  createdAt: string;
  updatedAt: string;
};
export type MaterialGameAdaptationInput = {
  blockId: string;
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
  targetStudentSubject?: string | null;
};
export type HomeworkAssignmentInput = {
  dueAt?: string | null;
  instructions?: string | null;
  materialId: string;
  studentSubjects: string[];
  title?: string | null;
};
export type VocabularyHomeworkInput = {
  dueAt?: string | null;
  instructions?: string | null;
  studentSubjects: string[];
  title?: string | null;
  mode?: "QUICK" | "BALANCED" | "WRITING" | "KEYBOARD";
  wordLimit?: number;
  pinnedEntryIds?: string[];
  excludedEntryIds?: string[];
  sourcePracticeId?: string | null;
};
export type LessonHomeworkInput = {
  dueAt?: string | null;
  instructions?: string | null;
  studentSubjects?: string[] | null;
  title?: string | null;
};
export type HomeworkAssignment = {
  id: string;
  materialId?: string | null;
  materialTitle?: string | null;
  contentKind?: "MATERIAL" | "VOCABULARY_PRACTICE";
  activityRef?: string | null;
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
  mySubmissionState?: "NOT_STARTED" | "DRAFT" | "SUBMITTED" | null;
  myScore?: number | null;
  mySubmittedAt?: string | null;
  mySubmissionUpdatedAt?: string | null;
  myActivityState?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | null;
  myCompletionRatio?: number | null;
  myAccuracy?: number | null;
  myDifficultWordCount?: number | null;
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
  activityRef?: string | null;
  activityState?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | null;
  completionRatio?: number | null;
  accuracy?: number | null;
  difficultWordCount?: number | null;
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
export type StudentVocabularyHomeworkDetail = {
  assignment: HomeworkAssignment;
  practiceId: string;
  sessionId: string;
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
