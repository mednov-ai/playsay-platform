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
  layout: LayoutId;
  title: string;
  difficulty: number;
  tier: LevelTier;
  chords: string[];
}

export type TrainingLessonKind = "STANDARD" | "FOCUS";

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
  chordSetId: number;
  lessonKind?: TrainingLessonKind;
  speedCpm: number;
  accuracy: number;
  errors: number;
  durationMs: number;
  perFinger: Record<string, number>;
  perChar?: Record<string, number>;
  perChord?: Record<string, number>;
  focusProblemKeys?: string[];
}

export interface TrainingResult {
  id: number;
  chordSetId: number;
  speedCpm: number;
  accuracy: number;
  errors: number;
  durationMs: number;
  perFinger: Record<string, number>;
  perChar?: Record<string, number>;
  perChord?: Record<string, number>;
  focusProblemKeys?: string[];
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
  weakFingers: FingerErrors[];
  recent: TrainingResult[];
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

export interface UpdateAnonymousProfileRequest {
  deviceId: string;
  displayName: string;
}

export interface SubmitAnonymousResult extends SubmitResult {
  deviceId: string;
  displayName?: string;
}
