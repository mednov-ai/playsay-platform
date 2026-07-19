import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createYjsWorkspaceRuntime, type AnnotationElement, updateHtmlGameAuthorityRuns } from "./yjsRuntime";

describe("yjs workspace runtime annotations", () => {
  it("stores annotation strokes in the collaboration document", () => {
    const annotationChanges: AnnotationElement[][] = [];
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

    runtime.setAnnotationElements([
      {
        color: "#00a878",
        createdAt: 2,
        id: "stroke-2",
        kind: "stroke",
        pageId: "material",
        points: [{ pageId: "material", x: 25, y: 30 }],
        strokeWidth: 16,
      },
      {
        color: "#2574ff",
        createdAt: 1,
        id: "stroke-1",
        kind: "stroke",
        pageId: "material",
        points: [{ pageId: "material", x: 10, y: 20 }],
        strokeWidth: 8,
      },
      {
        color: "#ff5c00",
        createdAt: 3,
        id: "empty",
        kind: "stroke",
        pageId: "material",
        points: [],
        strokeWidth: 4,
      },
    ]);

    expect(annotationChanges.at(-1)).toEqual([
      {
        color: "#2574ff",
        createdAt: 1,
        id: "stroke-1",
        kind: "stroke",
        pageId: "material",
        points: [{ pageId: "material", x: 10, y: 20 }],
        strokeWidth: 8,
      },
      {
        color: "#00a878",
        createdAt: 2,
        id: "stroke-2",
        kind: "stroke",
        pageId: "material",
        points: [{ pageId: "material", x: 25, y: 30 }],
        strokeWidth: 16,
      },
    ]);

    runtime.destroy();
  });

  it("restores text and annotations from the Yjs snapshot after reconnect", () => {
    withWindowBase64(() => {
      const stroke: AnnotationElement = {
        color: "#ff5c00",
        createdAt: 1,
        id: "stroke-1",
        kind: "stroke",
        pageId: "material",
        points: [{ pageId: "material", x: 12, y: 34 }],
        strokeWidth: 8,
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
      runtime.setAnnotationElements([stroke]);
      const snapshot = runtime.snapshot();
      runtime.destroy();

      const restoredAnnotationChanges: AnnotationElement[][] = [];
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

  it("merges simultaneous strokes from teacher and student without losing either", () => {
    withWindowBase64(() => {
      const teacherStroke: AnnotationElement = {
        color: "#ff5c00",
        createdAt: 1,
        id: "teacher-stroke",
        kind: "stroke",
        pageId: "page-1",
        points: [{ pageId: "page-1", x: 10, y: 20 }],
        strokeWidth: 8,
      };
      const studentStroke: AnnotationElement = {
        color: "#2574ff",
        createdAt: 2,
        id: "student-stroke",
        kind: "stroke",
        pageId: "page-1",
        points: [{ pageId: "page-1", x: 30, y: 40 }],
        strokeWidth: 8,
      };
      const createRuntime = (participantName: string) => createYjsWorkspaceRuntime({
        color: "#ff5c00",
        onAnnotationChange: () => undefined,
        onHtmlGameEffectsChange: () => undefined,
        onHtmlGameInputsChange: () => undefined,
        onHtmlGameSnapshotsChange: () => undefined,
        onParticipantsChange: () => undefined,
        onTextChange: () => undefined,
        participantName,
        snapshot: null,
      });
      const teacher = createRuntime("Teacher");
      const student = createRuntime("Student");
      teacher.setAnnotationElements([teacherStroke]);
      student.setAnnotationElements([studentStroke]);

      const mergedDocument = new Y.Doc();
      Y.applyUpdate(mergedDocument, Buffer.from(String(teacher.snapshot().yjsUpdateBase64), "base64"));
      Y.applyUpdate(mergedDocument, Buffer.from(String(student.snapshot().yjsUpdateBase64), "base64"));
      teacher.destroy();
      student.destroy();

      const mergedAnnotations: AnnotationElement[][] = [];
      const merged = createYjsWorkspaceRuntime({
        color: "#00a878",
        onAnnotationChange: (elements) => mergedAnnotations.push(elements),
        onHtmlGameEffectsChange: () => undefined,
        onHtmlGameInputsChange: () => undefined,
        onHtmlGameSnapshotsChange: () => undefined,
        onParticipantsChange: () => undefined,
        onTextChange: () => undefined,
        participantName: "Reconnected teacher",
        snapshot: {
          encoding: "yjs-update-v1",
          savedAt: new Date(0).toISOString(),
          schemaVersion: 1,
          yjsUpdateBase64: Buffer.from(Y.encodeStateAsUpdate(mergedDocument)).toString("base64"),
        },
      });

      expect(mergedAnnotations.at(-1)).toEqual([teacherStroke, studentStroke]);
      merged.destroy();
      mergedDocument.destroy();
    });
  });

  it("applies element changes by id without replacing unrelated collaborative objects", () => {
    const annotationChanges: AnnotationElement[][] = [];
    const runtime = createYjsWorkspaceRuntime({
      color: "#ff5c00",
      onAnnotationChange: (elements) => annotationChanges.push(elements),
      onHtmlGameEffectsChange: () => undefined,
      onHtmlGameInputsChange: () => undefined,
      onHtmlGameSnapshotsChange: () => undefined,
      onParticipantsChange: () => undefined,
      onTextChange: () => undefined,
      participantName: "Student",
      snapshot: null,
    });
    const first: AnnotationElement = {
      color: "#ff5c00",
      createdAt: 1,
      id: "stroke-1",
      kind: "stroke",
      pageId: "material",
      points: [{ pageId: "material", x: 10, y: 20 }],
      strokeWidth: 8,
    };
    const second: AnnotationElement = {
      color: "#2574ff",
      createdAt: 2,
      fill: "transparent",
      height: 120,
      id: "rectangle-1",
      kind: "rectangle",
      pageId: "material",
      strokeWidth: 4,
      width: 180,
      x: 100,
      y: 120,
    };

    runtime.setAnnotationElements([first]);
    runtime.applyAnnotationChanges({ deleteIds: [], upserts: [second] });
    expect(annotationChanges.at(-1)?.map((element) => element.id)).toEqual(["stroke-1", "rectangle-1"]);
    runtime.applyAnnotationChanges({ deleteIds: [first.id], upserts: [] });
    expect(annotationChanges.at(-1)).toEqual([second]);

    runtime.destroy();
  });

  it("reads legacy plain-object annotations and converts them when touched", () => {
    withWindowBase64(() => {
      const legacyStroke: AnnotationElement = {
        color: "#ff5c00",
        createdAt: 1,
        id: "legacy-stroke",
        kind: "stroke",
        pageId: "page-1",
        points: [{ pageId: "page-1", x: 10, y: 20 }],
        strokeWidth: 8,
      };
      const legacyDocument = new Y.Doc();
      legacyDocument.getMap("annotations").set(legacyStroke.id, legacyStroke);
      const annotationChanges: AnnotationElement[][] = [];
      const runtime = createYjsWorkspaceRuntime({
        color: "#ff5c00",
        onAnnotationChange: (elements) => annotationChanges.push(elements),
        onHtmlGameEffectsChange: () => undefined,
        onHtmlGameInputsChange: () => undefined,
        onHtmlGameSnapshotsChange: () => undefined,
        onParticipantsChange: () => undefined,
        onTextChange: () => undefined,
        participantName: "Student",
        snapshot: {
          encoding: "yjs-update-v1",
          savedAt: new Date(0).toISOString(),
          schemaVersion: 1,
          yjsUpdateBase64: Buffer.from(Y.encodeStateAsUpdate(legacyDocument)).toString("base64"),
        },
      });

      expect(annotationChanges.at(-1)).toEqual([legacyStroke]);
      runtime.applyAnnotationChanges({
        deleteIds: [],
        upserts: [{ ...legacyStroke, points: [...legacyStroke.points, { pageId: "page-1", x: 30, y: 40 }] }],
      });
      expect(annotationChanges.at(-1)?.[0]).toEqual(expect.objectContaining({
        id: legacyStroke.id,
        points: [
          { pageId: "page-1", x: 10, y: 20 },
          { pageId: "page-1", x: 30, y: 40 },
        ],
      }));

      runtime.destroy();
      legacyDocument.destroy();
    });
  });

  it("publishes a growing stroke as linear incremental updates", () => {
    let updateBytes = 0;
    const runtime = createYjsWorkspaceRuntime({
      color: "#ff5c00",
      onAnnotationChange: () => undefined,
      onDocumentUpdate: (update) => {
        updateBytes += update.byteLength;
      },
      onHtmlGameEffectsChange: () => undefined,
      onHtmlGameInputsChange: () => undefined,
      onHtmlGameSnapshotsChange: () => undefined,
      onParticipantsChange: () => undefined,
      onTextChange: () => undefined,
      participantName: "Student",
      snapshot: null,
    });
    const points: Array<{ pageId: string; x: number; y: number }> = [];

    for (let index = 0; index < 1_000; index += 1) {
      points.push({ pageId: "page-1", x: index % 1_000, y: (index * 2) % 1_000 });
      runtime.applyAnnotationChanges({
        deleteIds: [],
        upserts: [{
          color: "#ff5c00",
          createdAt: 1,
          id: "stroke-1",
          kind: "stroke",
          pageId: "page-1",
          points: [...points],
          strokeWidth: 8,
        }],
      });
    }

    expect(updateBytes).toBeLessThan(250_000);
    runtime.destroy();
  });

  it("stores collaborative mind map nodes by id", () => {
    const annotationChanges: AnnotationElement[][] = [];
    const runtime = createYjsWorkspaceRuntime({
      color: "#ff5c00",
      onAnnotationChange: (elements) => annotationChanges.push(elements),
      onHtmlGameEffectsChange: () => undefined,
      onHtmlGameInputsChange: () => undefined,
      onHtmlGameSnapshotsChange: () => undefined,
      onParticipantsChange: () => undefined,
      onTextChange: () => undefined,
      participantName: "Teacher",
      snapshot: null,
    });

    runtime.applyAnnotationChanges({
      deleteIds: [],
      upserts: [{
        color: "#ffffff",
        createdAt: 1,
        fill: "#ff5c00",
        fontSize: 24,
        height: 82,
        id: "map-1",
        kind: "mindMapNode",
        mapId: "map-1",
        order: 0,
        pageId: "page-1",
        parentId: null,
        side: "root",
        text: "Present Simple",
        width: 220,
        x: 390,
        y: 450,
      }],
    });

    expect(annotationChanges.at(-1)).toEqual([expect.objectContaining({ id: "map-1", kind: "mindMapNode", text: "Present Simple" })]);
    runtime.destroy();
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

  it("persists the presented HTML game block in the shared document", () => {
    withWindowBase64(() => {
      const presentations: Array<string | null> = [];
      const runtime = createYjsWorkspaceRuntime({
        color: "#ff5c00",
        onAnnotationChange: () => undefined,
        onHtmlGameEffectsChange: () => undefined,
        onHtmlGameInputsChange: () => undefined,
        onHtmlGamePresentationChange: (blockId) => presentations.push(blockId),
        onHtmlGameSnapshotsChange: () => undefined,
        onParticipantsChange: () => undefined,
        onTextChange: () => undefined,
        participantName: "Teacher",
        snapshot: null,
      });

      runtime.setHtmlGamePresentedBlock("game-a");
      const snapshot = runtime.snapshot();
      runtime.destroy();

      const restoredPresentations: Array<string | null> = [];
      const restored = createYjsWorkspaceRuntime({
        color: "#2574ff",
        onAnnotationChange: () => undefined,
        onHtmlGameEffectsChange: () => undefined,
        onHtmlGameInputsChange: () => undefined,
        onHtmlGamePresentationChange: (blockId) => restoredPresentations.push(blockId),
        onHtmlGameSnapshotsChange: () => undefined,
        onParticipantsChange: () => undefined,
        onTextChange: () => undefined,
        participantName: "Student",
        snapshot,
      });

      expect(presentations).toContain("game-a");
      expect(restoredPresentations.at(-1)).toBe("game-a");
      restored.setHtmlGamePresentedBlock(null);
      expect(restoredPresentations.at(-1)).toBeNull();
      restored.destroy();
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
