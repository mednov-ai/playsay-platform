import type { LessonMaterialJson } from "../../../shared/api/playsay";

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
  snapshot: () => LessonMaterialJson;
  startSocketSync: (socket: WebSocket) => void;
  updateCursor: (cursor: CollaborationCursor | null) => void;
  updateText: (nextText: string) => void;
};

export function createYjsWorkspaceRuntime(options: {
  color: string;
  onParticipantsChange: (participants: CollaborationParticipant[]) => void;
  onTextChange: (text: string) => void;
  participantName: string;
  snapshot?: LessonMaterialJson | null;
}): YjsWorkspaceRuntime;
