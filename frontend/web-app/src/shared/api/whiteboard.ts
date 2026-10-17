import { authConfig } from "./auth";
import { apiJson } from "./http";
import type { CollaborationDocument } from "./types";

export type WhiteboardRegion = { x: number; y: number; width: number; height: number; revision?: number };
export type LessonWhiteboard = {
  id: string; lessonId: string; scope: "GROUP" | "INDIVIDUAL"; studentSubject: string | null;
  background: string; learnerInkEnabled: boolean; contentEpoch: number; controlRevision: number;
  activeSurface: "MATERIAL" | "WHITEBOARD"; canManage: boolean; canDraw: boolean; readOnly: boolean;
  document: CollaborationDocument; createdAt: string; updatedAt: string;
};
export type WhiteboardContext = { enabled: boolean; canManage: boolean; board: LessonWhiteboard | null };
export type WhiteboardCommand = { background?: string; learnerInkEnabled?: boolean; activeSurface?: "MATERIAL" | "WHITEBOARD"; clear?: boolean };
function contextPath(lessonId: string, studentSubject?: string | null): string {
  const params = studentSubject ? `?${new URLSearchParams({ studentSubject })}` : "";
  return `/api/schedule/lessons/${lessonId}/whiteboard${params}`;
}
export function fetchWhiteboardContext(lessonId: string, studentSubject?: string | null): Promise<WhiteboardContext> {
  return apiJson(contextPath(lessonId, studentSubject), { method: "GET" }, authConfig);
}
export function ensureLessonWhiteboard(lessonId: string, studentSubject?: string | null): Promise<LessonWhiteboard> {
  return apiJson(contextPath(lessonId, studentSubject), { method: "POST" }, authConfig);
}
export function updateLessonWhiteboard(board: LessonWhiteboard, command: WhiteboardCommand): Promise<LessonWhiteboard> {
  return apiJson(`/api/schedule/lessons/${board.lessonId}/whiteboards/${board.id}`, {
    method: "PUT", body: JSON.stringify({ ...command, expectedRevision: board.controlRevision }),
  }, authConfig);
}
export function fetchLessonWhiteboard(lessonId: string, boardId: string): Promise<LessonWhiteboard> {
  return apiJson(`/api/schedule/lessons/${lessonId}/whiteboards/${boardId}`, { method: "GET" }, authConfig);
}
export type WhiteboardSummary = { id: string; lessonId: string; studentName: string | null; updatedAt: string };
export function fetchLessonWhiteboards(lessonId: string): Promise<WhiteboardSummary[]> {
  return apiJson(`/api/schedule/lessons/${lessonId}/whiteboards`, { method: "GET" }, authConfig);
}
export type WhiteboardLibraryItem = { id: string; kind: "LESSON_WHITEBOARD"; lessonId: string; title: string | null; createdAt: string; updatedAt: string };
export async function fetchWhiteboardLibrary(): Promise<WhiteboardLibraryItem[]> {
  const entries: WhiteboardLibraryItem[] = [];
  let offset = 0;
  for (;;) {
    const page = await apiJson<{ items: WhiteboardLibraryItem[]; total: number }>(`/api/library/items?category=LESSON&kind=LESSON_WHITEBOARD&offset=${offset}&limit=200`, { method: "GET" }, authConfig);
    entries.push(...page.items); offset += page.items.length;
    if (offset >= page.total || !page.items.length) return entries;
  }
}
