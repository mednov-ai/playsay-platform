// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { removeWorksheetRegion, WorksheetImportWorkspace } from "./WorksheetImportWorkspace";
import type { WorksheetInteractionGroup } from "../../../shared/api/playsay";

vi.mock("../../../shared/api/playsay", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../shared/api/playsay")>(),
  fetchWorksheetImport: vi.fn(),
  fetchWorksheetPagePreview: vi.fn(),
  saveWorksheetImportReview: vi.fn(),
}));

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { clear: () => values.clear(), getItem: (key: string) => values.get(key) ?? null, key: (index: number) => Array.from(values.keys())[index] ?? null, get length() { return values.size; }, removeItem: (key: string) => values.delete(key), setItem: (key: string, value: string) => values.set(key, value) },
  });
});

describe("WorksheetImportWorkspace", () => {
  afterEach(cleanup);

  it("offers one ordered mixed image and PDF packet without publishing controls", () => {
    const markup = renderToStaticMarkup(<WorksheetImportWorkspace disabled={false} onClose={() => undefined} onMaterialized={() => undefined} />);
    expect(markup).toContain('type="file"');
    expect(markup).toContain('multiple=""');
    expect(markup).toContain("application/pdf");
    expect(markup).toContain("image/webp");
    expect(markup).toContain("worksheet-import-packet");
    expect(markup).not.toContain("PUBLISHED");
  });

  it("extracts an individual region for reclassification without leaving an incomplete source item", () => {
    const groups: WorksheetInteractionGroup[] = [{
      id: "pairs", order: 0, type: "MATCHING_PAIRS", pairs: [{
        id: "pair", number: 1,
        left: { kind: "TEXT", text: "cat", region: { x: 10, y: 10, width: 100, height: 30, anchor: "OCR_WORD" } },
        right: { kind: "IMAGE", imageAlt: "cat picture", region: { x: 500, y: 10, width: 100, height: 100, anchor: "ARTWORK" } },
      }],
    }];

    const result = removeWorksheetRegion(groups, 1);

    expect(result?.snapped.text).toBe("cat picture");
    expect(result?.snapped.region.anchor).toBe("ARTWORK");
    expect(result?.groups[0]?.pairs).toEqual([]);
    expect(groups[0]?.pairs).toHaveLength(1);
  });

  it("announces a recoverable local validation error and keeps later valid selections", () => {
    render(<WorksheetImportWorkspace disabled={false} onClose={() => undefined} onMaterialized={() => undefined} />);
    const input = screen.getByTestId("worksheet-import-files");
    fireEvent.change(input, { target: { files: [new File(["notes"], "notes.txt", { type: "text/plain" })] } });
    expect(screen.getByRole("alert")).toHaveTextContent(/1/);
    fireEvent.change(input, { target: { files: [new File(["image"], "page.webp", { type: "image/webp" })] } });
    expect(screen.getByText(/page\.webp/)).toBeInTheDocument();
    expect(screen.getByTestId("worksheet-import-analyze")).toBeDisabled();
  });

  it("records pointer movement before React releases the event", async () => {
    const api = await import("../../../shared/api/playsay");
    window.localStorage.setItem("honey-school:worksheet-import-session", "session-1");
    vi.mocked(api.fetchWorksheetImport).mockResolvedValue({
      id: "session-1", status: "READY", revision: 1, title: "Worksheet", language: "en", cefrLevel: "A1",
      sources: [], blockers: [], pages: [{ id: "page-1", sourceId: "source-1", order: 0, width: 1000, height: 1000, previewUrl: "", snapCandidates: [] }],
      review: { pages: [{ id: "page-1", order: 0, role: "WORKSHEET", sections: ["TYPED_GAPS"], groups: [] }] },
    });
    vi.mocked(api.fetchWorksheetPagePreview).mockResolvedValue("blob:preview");
    vi.mocked(api.saveWorksheetImportReview).mockImplementation(async (_sessionId, revision, review) => ({
      id: "session-1", status: "READY", revision: revision + 1, title: "Worksheet", language: "en", cefrLevel: "A1",
      sources: [], blockers: [], pages: [{ id: "page-1", sourceId: "source-1", order: 0, width: 1000, height: 1000, previewUrl: "", snapCandidates: [] }], review,
    }));

    render(<WorksheetImportWorkspace disabled={false} onClose={() => undefined} onMaterialized={() => undefined} />);
    const canvas = await screen.findByTestId("worksheet-import-canvas");
    Object.defineProperty(canvas, "getBoundingClientRect", { value: () => ({ left: 0, top: 0, width: 1000, height: 1000 }) });
    Object.defineProperty(canvas, "setPointerCapture", { value: vi.fn() });
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    expect(() => fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 140, clientY: 120 })).not.toThrow();
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 180, clientY: 130 });
    expect(await screen.findByRole("group", { name: "Answer 1" })).toBeVisible();
  });
});
