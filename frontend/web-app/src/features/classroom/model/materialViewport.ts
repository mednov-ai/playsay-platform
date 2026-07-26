export type MaterialViewportPresentationMode =
  | "default"
  | "html-game-focus"
  | "image-focus"
  | "external-activity-focus";

export type MaterialViewportState = {
  focusedBlockId?: string;
  materialId: string;
  pageId: string;
  presentationMode: MaterialViewportPresentationMode;
  revision: number;
  scrollContainer: "document" | "image";
  sourceClientId: number;
  x: number;
  y: number;
};

export type MaterialViewportUpdate = Omit<MaterialViewportState, "revision" | "sourceClientId">;
