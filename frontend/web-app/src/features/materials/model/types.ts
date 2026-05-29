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
  | "generatedImage";

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
  src: string;
  title: string;
};

export type MaterialAssessmentPolicy = {
  weight?: number;
  maxAttempts?: number;
  attemptPenalty?: number;
  hintPenalty?: number;
  lockAfterAttempts?: boolean;
};

export type MaterialAttemptEntry = {
  at: string;
  correct?: boolean;
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
  caption?: string;
  cards?: Array<{ id: string; front: string; back: string; example?: string }>;
  items?: Array<{
    id?: string;
    prompt: string;
    answer?: string;
    acceptedAnswers?: string[];
    aiSuggestedAnswers?: MaterialAnswerSuggestion[];
    options?: string[];
    threadRootItemId?: string;
    weight?: number;
  }>;
  pairs?: MaterialMatchingPair[];
  height?: number;
};

export const MAX_MANUAL_INPUT_HINTS = 3;

export const emptyMaterialMatchingPairs: MaterialMatchingPair[] = [];

export type MaterialExerciseItem = NonNullable<MaterialEditorBlock["items"]>[number];

export type MaterialEditorPage = {
  id: string;
  title: string;
  layout: "FLOW" | "WORKSHEET";
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

export type MaterialFormState = {
  id: string | null;
  updatedAt: string | null;
  title: string;
  description: string;
  language: string;
  cefrLevel: string;
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
