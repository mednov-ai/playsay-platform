import type { LessonMaterialJson } from "../../../shared/api/playsay";
import type { AnnotationStroke } from "../model/annotation";

export type { AnnotationStroke } from "../model/annotation";

export type CollaborationCursor = {
  x: number;
  y: number;
};

export type CollaborationParticipant = {
  clientId: number;
  color: string;
  cursor: CollaborationCursor | null;
  name: string;
};

export type YjsWorkspaceRuntime = {
  destroy: () => void;
  getText: () => string;
  handleSocketMessage: (data: unknown) => void;
  setSocket: (socket: WebSocket | null) => void;
  setAnnotationStrokes: (strokes: AnnotationStroke[]) => void;
  snapshot: () => LessonMaterialJson;
  startSocketSync: (socket: WebSocket) => void;
  updateCursor: (cursor: CollaborationCursor | null) => void;
  updateText: (nextText: string) => void;
};

export function createYjsWorkspaceRuntime(options: {
  color: string;
  onAnnotationChange: (strokes: AnnotationStroke[]) => void;
  onParticipantsChange: (participants: CollaborationParticipant[]) => void;
  onTextChange: (text: string) => void;
  participantName: string;
  snapshot?: LessonMaterialJson | null;
}): YjsWorkspaceRuntime;
