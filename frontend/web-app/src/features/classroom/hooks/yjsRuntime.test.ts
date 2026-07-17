import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { createYjsWorkspaceRuntime, type AnnotationStroke, updateHtmlGameAuthorityRuns } from "./yjsRuntime";

describe("yjs workspace runtime annotations", () => {
  it("stores annotation strokes in the collaboration document", () => {
    const annotationChanges: AnnotationStroke[][] = [];
    const runtime = createYjsWorkspaceRuntime({
      color: "#ff5c00",
      onAnnotationChange: (strokes) => annotationChanges.push(strokes),
      onHtmlGameEffectsChange: () => undefined,
      onHtmlGameInputsChange: () => undefined,
      onHtmlGameSnapshotsChange: () => undefined,
      onParticipantsChange: () => undefined,
      onTextChange: () => undefined,
      participantName: "Student",
      snapshot: null,
    });

    runtime.setAnnotationStrokes([
      {
        color: "#00a878",
        id: "stroke-2",
        pageId: "material",
        points: [{ pageId: "material", x: 25, y: 30 }],
      },
      {
        color: "#2574ff",
        id: "stroke-1",
        pageId: "material",
        points: [{ pageId: "material", x: 10, y: 20 }],
      },
      {
        color: "#ff5c00",
        id: "empty",
        pageId: "material",
        points: [],
      },
    ]);

    expect(annotationChanges.at(-1)).toEqual([
      {
        color: "#2574ff",
        id: "stroke-1",
        pageId: "material",
        points: [{ pageId: "material", x: 10, y: 20 }],
      },
      {
        color: "#00a878",
        id: "stroke-2",
        pageId: "material",
        points: [{ pageId: "material", x: 25, y: 30 }],
      },
    ]);

    runtime.destroy();
  });

  it("persists text and annotations in one Yjs snapshot", () => {
    withWindowBase64(() => {
      const stroke: AnnotationStroke = {
        color: "#ff5c00",
        id: "stroke-1",
        pageId: "material",
        points: [{ pageId: "material", x: 12, y: 34 }],
      };
      const runtime = createYjsWorkspaceRuntime({
        color: "#ff5c00",
        onAnnotationChange: () => undefined,
        onHtmlGameEffectsChange: () => undefined,
        onHtmlGameInputsChange: () => undefined,
        onHtmlGameSnapshotsChange: () => undefined,
        onParticipantsChange: () => undefined,
        onTextChange: () => undefined,
        participantName: "Student",
        snapshot: null,
      });

      runtime.updateText("Shared draft");
      runtime.setAnnotationStrokes([stroke]);
      const snapshot = runtime.snapshot();
      runtime.destroy();

      const restoredAnnotationChanges: AnnotationStroke[][] = [];
      const restoredTextChanges: string[] = [];
      const restored = createYjsWorkspaceRuntime({
        color: "#00a878",
        onAnnotationChange: (strokes) => restoredAnnotationChanges.push(strokes),
        onHtmlGameEffectsChange: () => undefined,
        onHtmlGameInputsChange: () => undefined,
        onHtmlGameSnapshotsChange: () => undefined,
        onParticipantsChange: () => undefined,
        onTextChange: (text) => restoredTextChanges.push(text),
        participantName: "Teacher",
        snapshot,
      });

      expect(restored.getText()).toBe("Shared draft");
      expect(restoredTextChanges.at(-1)).toBe("Shared draft");
      expect(restoredAnnotationChanges.at(-1)).toEqual([stroke]);

      restored.destroy();
    });
  });

  it("persists HTML game state separately for each block", () => {
    withWindowBase64(() => {
      const snapshots: Array<Record<string, { html: string; sequence: number; updatedAt: number }>> = [];
      const inputs: Array<Array<{ id: string }>> = [];
      const effects: Array<Array<{ id: string }>> = [];
      const runtime = createYjsWorkspaceRuntime({
        color: "#ff5c00",
        onAnnotationChange: () => undefined,
        onHtmlGameEffectsChange: (nextEffects) => effects.push(nextEffects),
        onHtmlGameInputsChange: (nextInputs) => inputs.push(nextInputs),
        onHtmlGameSnapshotsChange: (nextSnapshots) => snapshots.push(nextSnapshots),
        onParticipantsChange: () => undefined,
        onTextChange: () => undefined,
        participantName: "Teacher",
        snapshot: null,
      });

      runtime.setHtmlGameSnapshot("game-a", { html: "<p>one</p>", sequence: 1, updatedAt: 10 });
      runtime.setHtmlGameSnapshot("game-b", { html: "<p>two</p>", sequence: 4, updatedAt: 20 });
      runtime.publishHtmlGameInput({ at: 30, blockId: "game-a", id: "input-1", targetId: "start", type: "click" });
      runtime.publishHtmlGameEffect({ at: 40, blockId: "game-a", id: "effect-1", kind: "speech", payload: { text: "go" } });

      expect(snapshots.at(-1)).toEqual({
        "game-a": { html: "<p>one</p>", sequence: 1, updatedAt: 10 },
        "game-b": { html: "<p>two</p>", sequence: 4, updatedAt: 20 },
      });
      expect(inputs.at(-1)?.at(-1)?.id).toBe("input-1");
      expect(effects.at(-1)?.at(-1)?.id).toBe("effect-1");

      runtime.destroy();
    });
  });

  it("keeps simultaneous HTML game authority runs separately per block", () => {
    const first = updateHtmlGameAuthorityRuns({}, "game-a", "run-a");
    const second = updateHtmlGameAuthorityRuns(first, "game-b", "run-b");

    expect(second).toEqual({ "game-a": "run-a", "game-b": "run-b" });
    expect(updateHtmlGameAuthorityRuns(second, "game-a", null)).toEqual({ "game-b": "run-b" });
    expect(second).toEqual({ "game-a": "run-a", "game-b": "run-b" });
  });
});

function withWindowBase64(run: () => void) {
  const globalWithWindow = globalThis as typeof globalThis & { window?: { atob: (value: string) => string; btoa: (value: string) => string } };
  const hadWindow = "window" in globalWithWindow;
  const originalWindow = globalWithWindow.window;

  Object.defineProperty(globalWithWindow, "window", {
    configurable: true,
    value: {
      atob: (value: string) => Buffer.from(value, "base64").toString("binary"),
      btoa: (value: string) => Buffer.from(value, "binary").toString("base64"),
    },
  });

  try {
    run();
  } finally {
    if (hadWindow) {
      Object.defineProperty(globalWithWindow, "window", {
        configurable: true,
        value: originalWindow,
      });
    } else {
      Reflect.deleteProperty(globalWithWindow, "window");
    }
  }
}
