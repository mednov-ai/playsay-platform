import type { LessonMaterialJson } from "../../../shared/api/playsay";
import type { AnnotationElement } from "../model/annotation";
import type { MaterialViewportState, MaterialViewportUpdate } from "../model/materialViewport";
import type {
  MaterialAnswerBlock,
  MaterialAnswerState,
  MaterialExerciseInteraction,
  MaterialHtmlGameEffect,
  MaterialHtmlGameInputEvent,
  MaterialHtmlGameSnapshot,
} from "../../materials/model/materialDocument";

export type { AnnotationElement } from "../model/annotation";

export type CollaborationCursor = {
  anchorId?: string;
  x: number;
  y: number;
};

export type CollaborationParticipant = {
  clientId: number;
  color: string;
  cursor: CollaborationCursor | null;
  exerciseInteraction: MaterialExerciseInteraction | null;
  htmlGameAuthorityRuns: Record<string, string>;
  name: string;
};

export type YjsWorkspaceRuntime = {
  applyAnnotationChanges: (changes: { deleteIds: string[]; upserts: AnnotationElement[] }) => void;
  destroy: () => void;
  getText: () => string;
  handleSocketMessage: (data: unknown) => void;
  setSocket: (socket: WebSocket | null) => void;
  setAnnotationElements: (elements: AnnotationElement[]) => void;
  publishHtmlGameEffect: (effect: MaterialHtmlGameEffect) => void;
  publishHtmlGameInput: (event: MaterialHtmlGameInputEvent) => void;
  setHtmlGameSnapshot: (blockId: string, snapshot: MaterialHtmlGameSnapshot) => void;
  setHtmlGamePresentedBlock: (blockId: string | null) => void;
  seedMaterialAnswers: (answers: MaterialAnswerState) => void;
  setMaterialAnswer: (blockId: string, answer: MaterialAnswerBlock) => void;
  setMaterialViewport: (viewport: MaterialViewportUpdate) => void;
  updateHtmlGameAuthority: (blockId: string, runId: string | null) => void;
  snapshot: () => LessonMaterialJson;
  startSocketSync: (socket: WebSocket) => void;
  updateCursor: (cursor: CollaborationCursor | null) => void;
  updateExerciseInteraction: (interaction: MaterialExerciseInteraction | null) => void;
  updateText: (nextText: string) => void;
};

export function createYjsWorkspaceRuntime(options: {
  color: string;
  onAnnotationChange: (elements: AnnotationElement[]) => void;
  onHtmlGameEffectsChange: (effects: MaterialHtmlGameEffect[]) => void;
  onHtmlGameInputsChange: (events: MaterialHtmlGameInputEvent[]) => void;
  onHtmlGamePresentationChange?: (blockId: string | null) => void;
  onHtmlGameSnapshotsChange: (snapshots: Record<string, MaterialHtmlGameSnapshot>) => void;
  onMaterialAnswersChange?: (answers: MaterialAnswerState) => void;
  onMaterialViewportChange?: (viewport: MaterialViewportState | null) => void;
  onDocumentUpdate?: (update: Uint8Array) => void;
  onParticipantsChange: (participants: CollaborationParticipant[]) => void;
  onTextChange: (text: string) => void;
  participantName: string;
  snapshot?: LessonMaterialJson | null;
}): YjsWorkspaceRuntime;

export function normalizeExerciseInteraction(value: unknown): MaterialExerciseInteraction | null;

export function updateHtmlGameAuthorityRuns(
  current: unknown,
  blockId: string,
  runId: string | null,
): Record<string, string>;
