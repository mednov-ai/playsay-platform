import { describe, expect, it } from "vitest";
import {
  isMaterialViewportNewer,
  type MaterialViewportState,
} from "./materialViewport";

const imageFocus = {
  focusedBlockId: "image-1",
  materialId: "material-1",
  pageId: "page-1",
  presentationMode: "image-focus",
  presentationRevision: 100,
  revision: 500,
  scrollContainer: "image",
  sourceClientId: 1,
  x: 0,
  y: 0.5,
} satisfies MaterialViewportState;

describe("material viewport ordering", () => {
  it("prioritizes a newer presentation epoch over a larger stale scroll revision", () => {
    const closed = {
      ...imageFocus,
      focusedBlockId: undefined,
      presentationMode: "default",
      presentationRevision: 101,
      revision: 101,
      scrollContainer: "document",
      sourceClientId: 2,
      y: 0,
    } satisfies MaterialViewportState;

    expect(isMaterialViewportNewer(closed, imageFocus)).toBe(true);
    expect(isMaterialViewportNewer(imageFocus, closed)).toBe(false);
  });

  it("uses scroll revision and source only inside the same presentation epoch", () => {
    const laterScroll = {
      ...imageFocus,
      revision: 501,
      sourceClientId: 2,
      y: 0.75,
    };

    expect(isMaterialViewportNewer(laterScroll, imageFocus)).toBe(true);
    expect(isMaterialViewportNewer(imageFocus, laterScroll)).toBe(false);
  });
});
