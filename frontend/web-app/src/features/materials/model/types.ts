import type { LessonMaterialAsset, LessonMaterialJson } from "../../../shared/api/playsay";

export type MaterialBlockType =
  | "text"
  | "image"
  | "videoEmbed"
  | "flashcards"
  | "fillGaps"
  | "multipleChoice"
  | "matchingPairs"
  | "freeWriting"
  | "speakingPrompt"
  | "drawingArea"
  | "generatedImage"
  | "htmlGame"
  | "externalActivity";

export type ExternalActivityProvider =
  | "LIVEWORKSHEETS"
  | "WORDWALL"
  | "ISLCOLLECTIVE"
  | "TOPWORKSHEETS"
  | "JEOPARDYLABS"
  | "EXPERIMENTAL";

export type ExternalActivitySupportLevel = "GUARANTEED" | "EXPERIMENTAL";

export type MaterialImageSize = "SMALL" | "MEDIUM" | "LARGE" | "FULL";

export type MaterialHtmlGameInputEvent = {
  id: string;
  runId?: string;
  at: number;
  blockId: string;
  type:
    | "beforeinput"
    | "blur"
    | "change"
    | "click"
    | "compositionend"
    | "compositionstart"
    | "compositionupdate"
    | "dragover"
    | "dragstart"
    | "drop"
    | "focus"
    | "input"
    | "keydown"
    | "keyup"
    | "pointercancel"
    | "pointerdown"
    | "pointermove"
    | "pointerup";
  targetId: string;
  key?: string;
  code?: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  button?: number;
  buttons?: number;
  checked?: boolean;
  data?: string | null;
  inputType?: string;
  isPrimary?: boolean;
  pointerId?: number;
  pointerType?: string;
  relativeX?: number;
  relativeY?: number;
  selectedIndex?: number;
  selectionEnd?: number | null;
  selectionStart?: number | null;
  value?: string;
};

export type MaterialHtmlGameEffect = {
  id: string;
  at: number;
  blockId: string;
  kind: "audio" | "speech";
  payload: Record<string, string | number | boolean>;
};

export type MaterialHtmlGameSnapshot = {
  canvases?: Record<string, string>;
  controls?: Record<string, {
    checked?: boolean;
    selectedIndex?: number;
    selectionEnd?: number | null;
    selectionStart?: number | null;
    value?: string;
  }>;
  html: string;
  runId?: string;
  scroll?: Record<string, { left: number; top: number }>;
  sequence: number;
  updatedAt: number;
};

export type MaterialHtmlGameSync = {
  authorityRuns: Record<string, string>;
  effects: MaterialHtmlGameEffect[];
  inputs: MaterialHtmlGameInputEvent[];
  isAuthority: boolean;
  presentedBlockId: string | null;
  ready: boolean;
  publishEffect: (effect: MaterialHtmlGameEffect) => void;
  publishInput: (event: MaterialHtmlGameInputEvent) => void;
  publishSnapshot: (blockId: string, snapshot: MaterialHtmlGameSnapshot) => void;
  setAuthorityRun: (blockId: string, runId: string | null) => void;
  setPresentedBlock: (blockId: string | null) => void;
  snapshots: Record<string, MaterialHtmlGameSnapshot>;
};

export type MaterialExternalActivitySync = {
  active: {
    blockId: string;
    sessionId: string;
    hostIdentity: string | null;
    phase: "REQUESTED" | "AWAITING_EXTENSION" | "STARTING" | "ACTIVE" | "ERROR";
    studentsLocked: boolean;
    errorCode?: string;
    visible: boolean;
  } | null;
  cursors: Array<{ identity: string; name: string; color: string; x: number; y: number }>;
  isHost: boolean;
  mediaStream: MediaStream | null;
  open: (block: MaterialEditorBlock) => void;
  collapse: () => void;
  sendInput: (input: {
    type: "pointer" | "scroll" | "key";
    [key: string]: unknown;
  }) => void;
  sendCursor: (x: number, y: number) => void;
  setStudentsLocked: (locked: boolean) => void;
  reload: () => void;
  back: () => void;
  stop: () => void;
};

export type MaterialMatchingTargetKind = "TEXT" | "IMAGE";

export type MaterialMatchingPair = {
  id: string;
  left: string;
  right: string;
  targetKind?: MaterialMatchingTargetKind;
  imagePrompt?: string;
  imageAlt?: string;
  imageUrl?: string;
};

export type MaterialImageGenerationProgress = {
  current?: number;
  label: string;
  total: number;
};

export type MaterialAssetLibraryItem = {
  alt: string;
  asset: LessonMaterialAsset;
  materialId: string;
  materialTitle: string;
  prompt: string;
  searchText: string;
  tags: string[];
};

export type MaterialVideoEmbedFrame = {
  kind: "EMBED" | "RF_RELAY" | "PENDING" | "UNAVAILABLE";
  mode?: string;
  reason?: string | null;
  src: string;
  thumbnailUrl?: string | null;
  title: string;
};

export type MaterialVideoClip = {
  startSeconds?: number;
  endSeconds?: number;
};

export type MaterialAssessmentPolicy = {
  weight?: number;
  maxAttempts?: number;
  maxErrors?: number;
  attemptPenalty?: number;
  hintCount?: number;
  hintPenalty?: number;
  lockAfterAttempts?: boolean;
};

export type MaterialAttemptEntry = {
  at: string;
  correct?: boolean;
  optionId?: string;
  value: string;
};

export type MaterialHintEntry = {
  at: string;
  label: string;
  penalty: number;
  type: string;
  value?: string;
};

export type MaterialAnswerSuggestion = {
  confidence: number;
  reason: string;
  value: string;
};

export type MaterialFillGapMode = "typed" | "singleChoice" | "wordBank" | "formTransform";

export type MaterialWordBankOption = {
  id: string;
  value: string;
};

export type MaterialAnswerStatus = {
  attemptsUsed: number;
  correct: boolean;
  incorrectAttempts: number;
  hintsUsed: number;
  kind: "empty" | "draft" | "correct" | "retry" | "hint" | "wrong" | "locked";
  label: string;
  locked: boolean;
  maxAttempts: number;
};

export type MaterialEditorBlock = {
  id: string;
  type: MaterialBlockType;
  title: string;
  assessment?: MaterialAssessmentPolicy;
  body?: string;
  prompt?: string;
  url?: string;
  provider?: string;
  externalActivitySupportLevel?: ExternalActivitySupportLevel;
  videoClip?: MaterialVideoClip;
  caption?: string;
  alt?: string;
  objectFit?: "contain" | "cover";
  imageSize?: MaterialImageSize;
  cards?: Array<{ id: string; front: string; back: string; example?: string }>;
  items?: Array<{
    id?: string;
    prompt: string;
    answer?: string;
    answerOptionId?: string;
    acceptedAnswers?: string[];
    aiSuggestedAnswers?: MaterialAnswerSuggestion[];
    baseForm?: string;
    gapMode?: MaterialFillGapMode;
    hintPrefixLength?: number;
    hintCount?: number;
    maxAttempts?: number;
    maxErrors?: number;
    options?: string[];
    threadRootItemId?: string;
    weight?: number;
  }>;
  pairs?: MaterialMatchingPair[];
  wordBankOptions?: MaterialWordBankOption[];
  height?: number;
  gameIconUrl?: string;
  gameTitleSource?: "FILE" | "HTML" | "AI" | "USER";
};

export const MIN_MANUAL_INPUT_HINTS = 3;

export const MAX_MANUAL_INPUT_HINTS = 5;

export const emptyMaterialMatchingPairs: MaterialMatchingPair[] = [];

export type MaterialExerciseItem = NonNullable<MaterialEditorBlock["items"]>[number];

export type MaterialEditorPage = {
  id: string;
  title: string;
  layout: "FLOW" | "WORKSHEET" | "STATIC_IMAGE" | "HTML_GAME";
  blocks: MaterialEditorBlock[];
};

export type MaterialEditorDocument = {
  schemaVersion: 1;
  pages: MaterialEditorPage[];
};

export type MaterialRenderMode = "classroom" | "teacherPreview";

export type MaterialAuthorMode = "preview" | "edit";

export type MaterialAnswerBlock = Record<string, unknown>;

export type MaterialAnswerState = Record<string, MaterialAnswerBlock>;

export type MaterialExerciseInteraction =
  | {
    blockId: string;
    kind: "wordBankDrag";
    optionId: string;
    targetItemKey?: string;
  }
  | {
    blockId: string;
    kind: "matchingSelection";
    leftId: string;
    rightId?: string;
  };

export type MaterialExerciseParticipant = {
  clientId: number;
  color: string;
  interaction: MaterialExerciseInteraction;
  name: string;
};

export type MaterialExerciseSync = {
  answers: MaterialAnswerState;
  participants: MaterialExerciseParticipant[];
  ready: boolean;
  seedAnswers: (answers: MaterialAnswerState) => void;
  setAnswer: (blockId: string, answer: MaterialAnswerBlock) => void;
  updateInteraction: (interaction: MaterialExerciseInteraction | null) => void;
};

export type MaterialFormState = {
  id: string | null;
  updatedAt: string | null;
  title: string;
  description: string;
  language: string;
  cefrLevel: string;
  topicTags: string;
  skillTags: string;
  ageBand: string;
  estimatedDurationMin: string;
  visibility: "PRIVATE" | "PUBLIC";
  status: "DRAFT" | "PUBLISHED";
  sourcePrompt: string;
  document: MaterialEditorDocument;
  scoringRubric: LessonMaterialJson;
  sourceMeta: LessonMaterialJson;
};

export type MaterialDraftSourceImage = {
  dataUrl: string;
  fileName: string;
  originalSize: number;
};
