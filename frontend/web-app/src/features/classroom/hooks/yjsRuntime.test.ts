import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  createYjsWorkspaceRuntime,
  normalizeExerciseInteraction,
  type AnnotationElement,
  updateHtmlGameAuthorityRuns,
} from "./yjsRuntime";

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

  it("undoes only annotation transactions tracked by the local runtime", () => {
    const annotationChanges: AnnotationElement[][] = [];
    const undoStates: Array<{ canRedo: boolean; canUndo: boolean }> = [];
    const stroke: AnnotationElement = {
      color: "#ff5c00",
      createdAt: 1,
      id: "stroke-local",
      kind: "stroke",
      pageId: "material",
      points: [{ pageId: "material", x: 10, y: 20 }],
      strokeWidth: 8,
    };
    const runtime = createYjsWorkspaceRuntime({
      color: "#ff5c00",
      onAnnotationChange: (elements) => annotationChanges.push(elements),
      onAnnotationUndoStateChange: (state) => undoStates.push(state),
      onHtmlGameEffectsChange: () => undefined,
      onHtmlGameInputsChange: () => undefined,
      onHtmlGameSnapshotsChange: () => undefined,
      onParticipantsChange: () => undefined,
      onTextChange: () => undefined,
      participantName: "Student",
      snapshot: null,
    });

    runtime.setAnnotationElements([stroke]);
    expect(undoStates.at(-1)).toEqual({ canRedo: false, canUndo: true });
    runtime.undoAnnotation();
    expect(annotationChanges.at(-1)).toEqual([]);
    expect(undoStates.at(-1)).toEqual({ canRedo: true, canUndo: false });
    runtime.redoAnnotation();
    expect(annotationChanges.at(-1)).toEqual([stroke]);

    runtime.destroy();
  });

  it("restores text and annotations from the Yjs snapshot after reconnect", () => {
    withWindowBase64(() => {
      const stroke: AnnotationElement = {
        anchorId: "image-1",
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

  it("merges simultaneous edits in the same annotation Y Text without losing characters", () => {
    withWindowBase64(() => {
      const baseText: AnnotationElement = {
        autoHeight: true,
        autoWidth: true,
        color: "#111111",
        createdAt: 1,
        fill: "#fffaf5",
        fontSize: 18,
        height: 34,
        id: "text-1",
        kind: "text",
        pageId: "page-1",
        text: "A",
        width: 72,
        x: 20,
        y: 30,
      };
      const createRuntime = (
        participantName: string,
        snapshot: Parameters<typeof createYjsWorkspaceRuntime>[0]["snapshot"],
        onAnnotationChange: (elements: AnnotationElement[]) => void = () => undefined,
      ) => createYjsWorkspaceRuntime({
        color: "#ff5c00",
        onAnnotationChange,
        onHtmlGameEffectsChange: () => undefined,
        onHtmlGameInputsChange: () => undefined,
        onHtmlGameSnapshotsChange: () => undefined,
        onParticipantsChange: () => undefined,
        onTextChange: () => undefined,
        participantName,
        snapshot,
      });
      const seed = createRuntime("Seed", null);
      seed.setAnnotationElements([baseText]);
      const sharedSnapshot = seed.snapshot();
      seed.destroy();

      const teacher = createRuntime("Teacher", sharedSnapshot);
      const student = createRuntime("Student", sharedSnapshot);
      teacher.applyAnnotationChanges({ deleteIds: [], upserts: [{ ...baseText, text: "AB" }] });
      student.applyAnnotationChanges({ deleteIds: [], upserts: [{ ...baseText, text: "AC" }] });

      const mergedDocument = new Y.Doc();
      Y.applyUpdate(mergedDocument, Buffer.from(String(teacher.snapshot().yjsUpdateBase64), "base64"));
      Y.applyUpdate(mergedDocument, Buffer.from(String(student.snapshot().yjsUpdateBase64), "base64"));
      teacher.destroy();
      student.destroy();

      const mergedAnnotations: AnnotationElement[][] = [];
      const merged = createRuntime("Merged", {
        encoding: "yjs-update-v1",
        savedAt: new Date(0).toISOString(),
        schemaVersion: 1,
        yjsUpdateBase64: Buffer.from(Y.encodeStateAsUpdate(mergedDocument)).toString("base64"),
      }, (elements) => mergedAnnotations.push(elements));
      const mergedElement = mergedAnnotations.at(-1)?.[0];
      const mergedText = String(mergedElement && "text" in mergedElement ? mergedElement.text : "");
      expect(mergedText).toContain("A");
      expect(mergedText).toContain("B");
      expect(mergedText).toContain("C");
      merged.destroy();
      mergedDocument.destroy();
    });
  });

  it("stores a normalized shared material viewport without a feedback payload", () => {
    const viewportChanges: Array<Record<string, unknown> | null> = [];
    const runtime = createYjsWorkspaceRuntime({
      color: "#ff5c00",
      onAnnotationChange: () => undefined,
      onHtmlGameEffectsChange: () => undefined,
      onHtmlGameInputsChange: () => undefined,
      onHtmlGameSnapshotsChange: () => undefined,
      onMaterialViewportChange: (viewport) => viewportChanges.push(viewport),
      onParticipantsChange: () => undefined,
      onTextChange: () => undefined,
      participantName: "Student",
      snapshot: null,
    });

    runtime.setMaterialViewport({
      focusedBlockId: "image-1",
      materialId: "material-1",
      pageId: "page-1",
      presentationMode: "image-focus",
      scrollContainer: "image",
      x: 1.5,
      y: -0.2,
    });

    expect(viewportChanges.at(-1)).toEqual(expect.objectContaining({
      focusedBlockId: "image-1",
      materialId: "material-1",
      presentationMode: "image-focus",
      scrollContainer: "image",
      x: 1,
      y: 0,
    }));
    runtime.destroy();
  });

  it("publishes ordered room video state and advances heartbeat without changing the revision", () => {
    const changes: Array<Record<string, {
      action: string;
      heartbeat: number;
      playing: boolean;
      positionSeconds: number;
      revision: number;
    }>> = [];
    const runtime = createYjsWorkspaceRuntime({
      color: "#ff5c00",
      onAnnotationChange: () => undefined,
      onHtmlGameEffectsChange: () => undefined,
      onHtmlGameInputsChange: () => undefined,
      onHtmlGameSnapshotsChange: () => undefined,
      onParticipantsChange: () => undefined,
      onTextChange: () => undefined,
      onVideoPlaybackChange: (states) => changes.push(states),
      participantName: "Student",
      snapshot: null,
    });

    runtime.setVideoPlayback("video-1", { action: "play", playing: true, positionSeconds: 12.5 });
    const played = changes.at(-1)?.["video-1"];
    expect(played).toEqual(expect.objectContaining({
      action: "play",
      heartbeat: 0,
      playing: true,
      positionSeconds: 12.5,
      revision: 1,
    }));

    runtime.setVideoPlayback("video-1", { action: "play", playing: true, positionSeconds: 14.5 }, { heartbeat: true });
    expect(changes.at(-1)?.["video-1"]).toEqual(expect.objectContaining({
      heartbeat: 1,
      positionSeconds: 14.5,
      revision: played?.revision,
    }));

    runtime.setVideoPlayback("video-1", { action: "seek", playing: false, positionSeconds: -3 });
    expect(changes.at(-1)?.["video-1"]).toEqual(expect.objectContaining({
      action: "seek",
      playing: false,
      positionSeconds: 0,
      revision: 2,
    }));
    runtime.destroy();
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

    expect(annotationChanges.at(-1)).toEqual([expect.objectContaining({
      height: 82,
      id: "map-1",
      kind: "mindMapNode",
      text: "Present Simple",
      width: 220,
    })]);
    runtime.destroy();
  });

  it("persists material answers and restores them from a collaboration snapshot", () => {
    withWindowBase64(() => {
      const answers: Array<Record<string, Record<string, unknown>>> = [];
      const runtime = createYjsWorkspaceRuntime({
        color: "#2574ff",
        onAnnotationChange: () => undefined,
        onHtmlGameEffectsChange: () => undefined,
        onHtmlGameInputsChange: () => undefined,
        onHtmlGameSnapshotsChange: () => undefined,
        onMaterialAnswersChange: (nextAnswers) => answers.push(nextAnswers),
        onParticipantsChange: () => undefined,
        onTextChange: () => undefined,
        participantName: "Student",
        snapshot: null,
      });

      runtime.setMaterialAnswer("fill-1", {
        type: "fillGaps",
        items: { first: "cloud", second: "rain" },
        optionIds: { first: "option-cloud" },
      });
      const snapshot = runtime.snapshot();
      expect(answers.at(-1)).toEqual({
        "fill-1": {
          type: "fillGaps",
          items: { first: "cloud", second: "rain" },
          optionIds: { first: "option-cloud" },
        },
      });
      runtime.destroy();

      const restoredAnswers: Array<Record<string, Record<string, unknown>>> = [];
      const restored = createYjsWorkspaceRuntime({
        color: "#ff5c00",
        onAnnotationChange: () => undefined,
        onHtmlGameEffectsChange: () => undefined,
        onHtmlGameInputsChange: () => undefined,
        onHtmlGameSnapshotsChange: () => undefined,
        onMaterialAnswersChange: (nextAnswers) => restoredAnswers.push(nextAnswers),
        onParticipantsChange: () => undefined,
        onTextChange: () => undefined,
        participantName: "Teacher",
        snapshot,
      });

      expect(restoredAnswers.at(-1)).toEqual(answers.at(-1));
      restored.destroy();
    });
  });

  it("merges simultaneous answers for different exercise items", () => {
    withWindowBase64(() => {
      const createRuntime = (participantName: string) => createYjsWorkspaceRuntime({
        color: "#2574ff",
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
      teacher.setMaterialAnswer("fill-1", { type: "fillGaps", items: { first: "cloud" } });
      student.setMaterialAnswer("fill-1", { type: "fillGaps", items: { second: "rain" } });

      const mergedDocument = new Y.Doc();
      Y.applyUpdate(mergedDocument, Buffer.from(String(teacher.snapshot().yjsUpdateBase64), "base64"));
      Y.applyUpdate(mergedDocument, Buffer.from(String(student.snapshot().yjsUpdateBase64), "base64"));
      teacher.destroy();
      student.destroy();

      const mergedAnswers: Array<Record<string, Record<string, unknown>>> = [];
      const merged = createYjsWorkspaceRuntime({
        color: "#00a878",
        onAnnotationChange: () => undefined,
        onHtmlGameEffectsChange: () => undefined,
        onHtmlGameInputsChange: () => undefined,
        onHtmlGameSnapshotsChange: () => undefined,
        onMaterialAnswersChange: (answers) => mergedAnswers.push(answers),
        onParticipantsChange: () => undefined,
        onTextChange: () => undefined,
        participantName: "Reconnected",
        snapshot: {
          encoding: "yjs-update-v1",
          savedAt: new Date(0).toISOString(),
          schemaVersion: 1,
          yjsUpdateBase64: Buffer.from(Y.encodeStateAsUpdate(mergedDocument)).toString("base64"),
        },
      });

      expect(mergedAnswers.at(-1)).toEqual({
        "fill-1": {
          type: "fillGaps",
          items: { first: "cloud", second: "rain" },
        },
      });
      merged.destroy();
      mergedDocument.destroy();
    });
  });

  it("normalizes only supported transient exercise interactions", () => {
    expect(normalizeExerciseInteraction({
      blockId: "fill-1",
      kind: "wordBankDrag",
      optionId: "option-1",
      targetItemKey: "gap-1",
    })).toEqual({
      blockId: "fill-1",
      kind: "wordBankDrag",
      optionId: "option-1",
      targetItemKey: "gap-1",
    });
    expect(normalizeExerciseInteraction({
      blockId: "match-1",
      kind: "matchingSelection",
      leftId: "pair-1",
    })).toEqual({
      blockId: "match-1",
      kind: "matchingSelection",
      leftId: "pair-1",
    });
    expect(normalizeExerciseInteraction({ blockId: "fill-1", kind: "unknown" })).toBeNull();
  });

  it("persists HTML game state separately for each block", () => {
    withWindowBase64(() => {
      const snapshots: Array<Record<string, { html: string; sequence: number; updatedAt: number }>> = [];
      const inputs: Array<Array<{ id: string }>> = [];
      const effects: Array<Array<{ id: string }>> = [];
      const patches: Array<Array<{ id: string }>> = [];
      const runtime = createYjsWorkspaceRuntime({
        color: "#ff5c00",
        onAnnotationChange: () => undefined,
        onHtmlGameEffectsChange: (nextEffects) => effects.push(nextEffects),
        onHtmlGameInputsChange: (nextInputs) => inputs.push(nextInputs),
        onHtmlGamePatchesChange: (nextPatches) => patches.push(nextPatches),
        onHtmlGameSnapshotsChange: (nextSnapshots) => snapshots.push(nextSnapshots),
        onParticipantsChange: () => undefined,
        onTextChange: () => undefined,
        participantName: "Teacher",
        snapshot: null,
      });

      runtime.setHtmlGameSnapshot("game-a", { html: "<p>one</p>", sequence: 1, updatedAt: 10 });
      runtime.setHtmlGameSnapshot("game-b", { html: "<p>two</p>", sequence: 4, updatedAt: 20 });
      runtime.setHtmlGameSnapshot("game-large-canvas", {
        canvases: { canvas: `data:image/webp;base64,${"a".repeat(250_000)}` },
        html: "<canvas></canvas>",
        sequence: 1,
        updatedAt: 25,
      });
      runtime.publishHtmlGameInput({ at: 30, blockId: "game-a", id: "input-1", targetId: "start", type: "click" });
      runtime.publishHtmlGameEffect({ at: 40, blockId: "game-a", id: "effect-1", kind: "speech", payload: { text: "go" } });
      runtime.publishHtmlGamePatch({
        at: 45,
        blockId: "game-a",
        id: "patch-1",
        operations: [{ name: "class", targetId: "modal", type: "attribute", value: "open" }],
        runId: "run-a",
        sequence: 1,
      });

      expect(snapshots.at(-1)).toEqual({
        "game-a": { html: "<p>one</p>", sequence: 1, updatedAt: 10 },
        "game-b": { html: "<p>two</p>", sequence: 4, updatedAt: 20 },
        "game-large-canvas": {
          canvases: {},
          html: "<canvas></canvas>",
          sequence: 1,
          updatedAt: 25,
        },
      });
      expect(inputs.at(-1)?.at(-1)?.id).toBe("input-1");
      expect(effects.at(-1)?.at(-1)?.id).toBe("effect-1");
      expect(patches.at(-1)?.at(-1)?.id).toBe("patch-1");

      runtime.destroy();
    });
  });

  it("keeps HTML game input and effect events out of durable snapshots", () => {
    withWindowBase64(() => {
      const runtime = createYjsWorkspaceRuntime({
        color: "#ff5c00",
        onAnnotationChange: () => undefined,
        onHtmlGameEffectsChange: () => undefined,
        onHtmlGameInputsChange: () => undefined,
        onHtmlGameSnapshotsChange: () => undefined,
        onParticipantsChange: () => undefined,
        onTextChange: () => undefined,
        participantName: "Teacher",
        snapshot: null,
      });
      runtime.publishHtmlGameInput({ at: 30, blockId: "game-a", id: "input-ephemeral", targetId: "start", type: "click" });
      runtime.publishHtmlGameEffect({ at: 40, blockId: "game-a", id: "effect-ephemeral", kind: "speech", payload: { text: "go" } });
      runtime.publishHtmlGamePatch({
        at: 50,
        blockId: "game-a",
        id: "patch-ephemeral",
        operations: [{ targetId: "modal", type: "remove" }],
        runId: "run-a",
        sequence: 1,
      });
      const snapshot = runtime.snapshot();
      runtime.destroy();

      const restoredInputs: Array<Array<{ id: string }>> = [];
      const restoredEffects: Array<Array<{ id: string }>> = [];
      const restoredPatches: Array<Array<{ id: string }>> = [];
      const restored = createYjsWorkspaceRuntime({
        color: "#2574ff",
        onAnnotationChange: () => undefined,
        onHtmlGameEffectsChange: (effects) => restoredEffects.push(effects),
        onHtmlGameInputsChange: (inputs) => restoredInputs.push(inputs),
        onHtmlGamePatchesChange: (patches) => restoredPatches.push(patches),
        onHtmlGameSnapshotsChange: () => undefined,
        onParticipantsChange: () => undefined,
        onTextChange: () => undefined,
        participantName: "Student",
        snapshot,
      });

      expect(restoredInputs.at(-1)).toEqual([]);
      expect(restoredEffects.at(-1)).toEqual([]);
      expect(restoredPatches.at(-1)).toEqual([]);
      restored.destroy();
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
