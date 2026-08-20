export type LayoutId = "EN" | "RU";

export type LevelTier = "beginner" | "confident" | "middle" | "professional";

export type Finger =
  | "leftPinky"
  | "leftRing"
  | "leftMiddle"
  | "leftIndex"
  | "rightIndex"
  | "rightMiddle"
  | "rightRing"
  | "rightPinky";

export interface KeyDef {
  code: string;
  char: string;
  shiftedChar?: string;
  requiresShift?: boolean;
  finger: Finger;
  row: number;
  col: number;
}

export interface FingerMeta {
  id: Finger;
  color: string;
}

export const FINGERS: FingerMeta[] = [
  { id: "leftPinky", color: "#ef4444" },
  { id: "leftRing", color: "#f97316" },
  { id: "leftMiddle", color: "#eab308" },
  { id: "leftIndex", color: "#22c55e" },
  { id: "rightIndex", color: "#14b8a6" },
  { id: "rightMiddle", color: "#0ea5e9" },
  { id: "rightRing", color: "#8b5cf6" },
  { id: "rightPinky", color: "#ec4899" },
];

export const FINGER_COLOR: Record<Finger, string> = Object.fromEntries(
  FINGERS.map((finger) => [finger.id, finger.color]),
) as Record<Finger, string>;

export const FINGER_ORDER: Finger[] = FINGERS.map((finger) => finger.id);

export interface ChordSet {
  id: number;
  sourceChordSetId?: number;
  focusProblemKeys?: string[];
  layout: LayoutId;
  title: string;
  difficulty: number;
  tier: LevelTier;
  chords: string[];
  practiceKind?: "LETTER" | "CODE" | "CODE_COMBO" | "VOCABULARY";
  codeLanguages?: string[];
  practiceContext?: PracticeContext;
  vocabularyContext?: VocabularyRuntimeContext;
}

export interface VocabularyRuntimeContext {
  sessionId: string;
  mode: VocabularyKeyMode;
  targets: VocabularyKeyTarget[];
  typedTargets: boolean;
  startPosition: number;
  totalTargets: number;
  delivery: "SELF" | "LIVE" | "HOMEWORK";
  completionPolicy: string;
  assignmentId?: string;
  lessonId?: string;
  returnTarget?: "HONEY_SCHOOL_VOCABULARY" | "HONEY_SCHOOL_LESSON" | "HONEY_SCHOOL_HOMEWORK";
}

export interface PracticeContext {
  practiceKind: "CODE" | "CODE_COMBO" | "VOCABULARY";
  codeLanguages?: string[];
  difficultyBand?: "trigrams" | "quadgrams" | "long";
  title: string;
  numberRowEnabled?: boolean;
  vocabularyEntryIds?: string[];
  vocabularyItemIds?: string[];
  vocabularyWords?: string[];
  vocabularySessionId?: string;
  vocabularyMode?: VocabularyKeyMode;
  vocabularyMaterializerVersion?: string;
  vocabularyMaterializerSeed?: number;
  vocabularyCompletionPolicy?: string;
  vocabularyReturnTarget?: "HONEY_SCHOOL_VOCABULARY" | "HONEY_SCHOOL_LESSON" | "HONEY_SCHOOL_HOMEWORK";
}

export interface VocabularyPracticeEntry { id: string; sourceText: string; }
export interface VocabularyPracticeResponse { entries: VocabularyPracticeEntry[]; }
export interface VocabularySessionPracticeResponse {
  sessionId: string;
  title: string;
  entries: VocabularyPracticeEntry[];
  items: Array<{ itemId: string; entryId: string; sourceText: string }>;
  mode?: VocabularyKeyMode;
  layout?: LayoutId;
  materializerVersion?: string;
  materializerSeed?: number;
  ngramSettings?: VocabularyKeyNgramSettings;
  targets?: VocabularyKeyTarget[];
  completionContext?: {
    delivery: "SELF" | "LIVE" | "HOMEWORK";
    completionPolicy: string;
    completionPolicyVersion: string;
    assignmentId?: string;
    lessonId?: string;
    lastAcknowledgedPosition: number;
  };
  returnContext?: {
    target: "HONEY_SCHOOL_VOCABULARY" | "HONEY_SCHOOL_LESSON" | "HONEY_SCHOOL_HOMEWORK";
    path: "/";
  };
}
export type VocabularyKeyMode = "WHOLE_WORDS" | "CHARACTER_NGRAMS" | "MIXED";
export type VocabularyKeyTargetType = "WHOLE_WORD" | "CHARACTER_NGRAM";
export interface VocabularyKeyNgramSettings { minLength: number; maxLength: number; targetLimit: number; maxRepetitions: number; }
export interface VocabularyKeyTarget {
  targetId: string;
  position: number;
  type: VocabularyKeyTargetType;
  text: string;
  sourceEntryIds: string[];
  sourceItemIds: string[];
  offsets: Array<{ entryId: string; itemId: string; start: number; endExclusive: number }>;
}
export interface VocabularyTargetResult {
  resultId: string;
  targetId: string;
  targetType: VocabularyKeyTargetType;
  errors: number;
  durationMs: number;
  position: number;
  typedText?: string;
  sourceEntryIds: string[];
  sourceItemIds: string[];
}
export interface VocabularyKeyAcknowledgementResponse {
  sessionId: string;
  lastAcknowledgedPosition: number;
  revision: number;
}

export type TrainingLessonKind = "CALIBRATION" | "STANDARD" | "FOCUS";

export interface FocusLesson {
  kind: "FOCUS";
  sourceChordSetId: number;
  layout: LayoutId;
  reason: "SEVERE" | "MODERATE";
  problemKeys: string[];
  chords: string[];
  title: string;
}

export interface SubmitResult {
  clientResultId: string;
  chordSetId: number;
  lessonKind?: TrainingLessonKind;
  speedCpm: number;
  averageCpm: number;
  cadence: number;
  accuracy: number;
  errors: number;
  characterCount: number;
  correctCount: number;
  durationMs: number;
  perFinger: Record<string, number>;
  perChar?: Record<string, number>;
  perChord?: Record<string, number>;
  focusProblemKeys?: string[];
  windowMetrics?: Record<string, number>;
  clientTimezone?: string;
  localTrainingDate?: string;
  practiceContext?: PracticeContext;
  vocabularyResults?: VocabularyTargetResult[];
}

export interface TrainingResult {
  id: number;
  clientResultId?: string;
  chordSetId: number;
  layout: LayoutId;
  lessonKind?: TrainingLessonKind;
  speedCpm: number;
  averageCpm: number;
  cadence: number;
  masteryCpm?: number;
  masteryDelta: number;
  accuracy: number;
  errors: number;
  characterCount: number;
  correctCount: number;
  durationMs: number;
  perFinger: Record<string, number>;
  perChar?: Record<string, number>;
  perChord?: Record<string, number>;
  focusProblemKeys?: string[];
  clientTimezone?: string;
  localTrainingDate?: string;
  practiceContext?: PracticeContext;
  createdAt: string;
  focusLesson?: FocusLesson;
}

export interface FingerErrors {
  finger: string;
  errors: number;
}

export interface Progress {
  sessions: number;
  bestSpeedCpm: number;
  avgSpeedCpm: number;
  avgAccuracy: number;
  masteryCpm?: number;
  weakFingers: FingerErrors[];
  recent: TrainingResult[];
  gamification?: GamificationProfile;
}

export interface LayoutMasteryProfile {
  layout: LayoutId;
  calibrated: boolean;
  calibrationSessions: number;
  calibrationTarget: number;
  masteryCpm: number;
  baselineMasteryCpm?: number;
  leagueLevel?: number;
  leagueProgress: number;
  trend: number[];
}

export interface GamificationProfile {
  calibrated: boolean;
  calibrationSessions: number;
  calibrationTarget: number;
  masteryCpm: number;
  baselineMasteryCpm?: number;
  leagueLevel?: number;
  leagueProgress: number;
  currentStreak: number;
  bestStreak: number;
  streakFreezes: number;
  lastTrainingDate?: string;
  trend: number[];
  achievements: string[];
  layoutMastery?: Partial<Record<LayoutId, LayoutMasteryProfile>>;
  activeLayoutMastery?: LayoutMasteryProfile;
}

export interface GamificationEvent {
  id: number;
  type: string;
  payload: Record<string, string>;
  createdAt: string;
}

export interface TechniqueAdviceResponse {
  primaryAdvice: string;
  drillSuggestion: string;
  tone: "ACCURACY" | "RHYTHM" | "STEADY";
  source: "RULES" | "AI";
}

export interface SubmitTrainingResultResponse {
  trainingResult: TrainingResult;
  progress: Progress;
  gamification: GamificationProfile;
  events: GamificationEvent[];
  techniqueAdvice: TechniqueAdviceResponse;
  focusLesson?: FocusLesson;
}

export interface Me {
  subject: string;
  username: string;
  email?: string;
  roles: string[];
}

export interface AnonymousProfile {
  id: number;
  deviceId: string;
  displayName?: string;
  sessions: number;
}

export interface ResolveAnonymousProfileRequest {
  deviceId: string;
}

export interface ResetAnonymousProfileRequest {
  deviceId: string;
}

export interface UpdateAnonymousProfileRequest {
  deviceId: string;
  displayName: string;
}

export interface SubmitAnonymousResult extends SubmitResult {
  deviceId: string;
  displayName?: string;
}

export interface ClaimAnonymousProgressRequest {
  deviceId: string;
}

export interface ClaimAnonymousProgressResponse {
  claimedResults: number;
  progress: Progress;
}
