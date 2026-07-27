export type MaterialViewportPresentationMode =
  | "default"
  | "html-game-focus"
  | "image-focus"
  | "external-activity-focus";

export type MaterialViewportState = {
  focusedBlockId?: string;
  materialId: string;
  pageId: string;
  presentationRevision: number;
  presentationMode: MaterialViewportPresentationMode;
  revision: number;
  scrollContainer: "document" | "image";
  sourceClientId: number;
  x: number;
  y: number;
};

export type MaterialViewportUpdate = Omit<
  MaterialViewportState,
  "presentationRevision" | "revision" | "sourceClientId"
>;

export type MaterialViewportPublishOptions = {
  presentationChanged?: boolean;
};

export function isMaterialViewportNewer(
  candidate: MaterialViewportState | null,
  current: MaterialViewportState | null,
): boolean {
  if (!candidate) return false;
  if (!current) return true;
  return candidate.presentationRevision > current.presentationRevision || (
    candidate.presentationRevision === current.presentationRevision
    && (
      candidate.revision > current.revision
      || (
        candidate.revision === current.revision
        && candidate.sourceClientId > current.sourceClientId
      )
    )
  );
}
