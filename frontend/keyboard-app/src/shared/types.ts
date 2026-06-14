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
