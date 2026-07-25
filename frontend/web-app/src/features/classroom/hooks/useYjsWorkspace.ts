import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createCollaborationDocumentToken,
  type CollaborationDocument,
  type CollaborationDocumentToken,
  type LessonMaterialJson,
} from "../../../shared/api/playsay";
import {
  createYjsWorkspaceRuntime,
  type AnnotationElement,
  type CollaborationCursor,
  type CollaborationParticipant,
  type YjsWorkspaceRuntime,
} from "./yjsRuntime";
import type { MaterialHtmlGameEffect, MaterialHtmlGameInputEvent, MaterialHtmlGameSnapshot, MaterialHtmlGameSync } from "../../materials/model/materialDocument";
import type {
  MaterialAnswerBlock,
  MaterialAnswerState,
  MaterialExerciseInteraction,
  MaterialExerciseSync,
} from "../../materials/model/types";

export type { CollaborationCursor, CollaborationParticipant };

export type YjsWorkspaceStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export function useYjsWorkspace({
  color,
  document,
  enabled = true,
  participantName,
}: {
  color: string;
  document: CollaborationDocument | null;
  enabled?: boolean;
  participantName: string;
}) {
  const [participants, setParticipants] = useState<CollaborationParticipant[]>([]);
  const [status, setStatus] = useState<YjsWorkspaceStatus>("idle");
  const [annotationElements, setAnnotationElementsState] = useState<AnnotationElement[]>([]);
  const [text, setText] = useState("");
  const [htmlGameSnapshots, setHtmlGameSnapshots] = useState<Record<string, MaterialHtmlGameSnapshot>>({});
  const [htmlGameInputs, setHtmlGameInputs] = useState<MaterialHtmlGameInputEvent[]>([]);
  const [htmlGameEffects, setHtmlGameEffects] = useState<MaterialHtmlGameEffect[]>([]);
  const [presentedHtmlGameBlockId, setPresentedHtmlGameBlockId] = useState<string | null>(null);
  const [materialAnswers, setMaterialAnswers] = useState<MaterialAnswerState>({});
  const runtimeRef = useRef<YjsWorkspaceRuntime | null>(null);
  const exerciseInteractionRef = useRef<MaterialExerciseInteraction | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled || !document) {
      setAnnotationElementsState([]);
      setParticipants([]);
      setStatus("idle");
      setText("");
      setHtmlGameSnapshots({});
      setHtmlGameInputs([]);
      setHtmlGameEffects([]);
      setPresentedHtmlGameBlockId(null);
      setMaterialAnswers({});
      exerciseInteractionRef.current = null;
      return undefined;
    }

    let disposed = false;
    const runtime = createYjsWorkspaceRuntime({
      color,
      onAnnotationChange: setAnnotationElementsState,
      onHtmlGameEffectsChange: setHtmlGameEffects,
      onHtmlGameInputsChange: setHtmlGameInputs,
      onHtmlGamePresentationChange: setPresentedHtmlGameBlockId,
      onHtmlGameSnapshotsChange: setHtmlGameSnapshots,
      onMaterialAnswersChange: setMaterialAnswers,
      onParticipantsChange: setParticipants,
      onTextChange: setText,
      participantName,
      snapshot: document.snapshot,
    });
    runtimeRef.current = runtime;
    setStatus("connecting");

    void createCollaborationDocumentToken(document.lessonId, document.id)
      .then((tokenResponse) => {
        if (disposed) {
          return;
        }
        const socket = new WebSocket(collaborationWebSocketUrl(tokenResponse));
        socket.binaryType = "arraybuffer";
        socketRef.current = socket;
        socket.onopen = () => {
          setStatus("connected");
          runtime.startSocketSync(socket);
        };
        socket.onmessage = (event) => {
          runtime.handleSocketMessage(event.data);
        };
        socket.onclose = () => {
          if (!disposed) {
            setStatus("disconnected");
          }
        };
        socket.onerror = () => {
          if (!disposed) {
            setStatus("error");
          }
        };
      })
      .catch(() => {
        if (!disposed) {
          setStatus("error");
        }
      });

    return () => {
      disposed = true;
      socketRef.current?.close();
      socketRef.current = null;
      runtime.destroy();
      runtimeRef.current = null;
      setAnnotationElementsState([]);
      setParticipants([]);
      setHtmlGameSnapshots({});
      setHtmlGameInputs([]);
      setHtmlGameEffects([]);
      setPresentedHtmlGameBlockId(null);
      setMaterialAnswers({});
      exerciseInteractionRef.current = null;
    };
  }, [color, document?.id, enabled, participantName]);

  const updateText = useCallback((nextText: string) => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      setText(nextText);
      return;
    }
    runtime.updateText(nextText);
  }, []);

  const updateCursor = useCallback((cursor: CollaborationCursor | null) => {
    runtimeRef.current?.updateCursor(cursor);
  }, []);

  const setAnnotationElements = useCallback((updater: (current: AnnotationElement[]) => AnnotationElement[]) => {
    setAnnotationElementsState((current) => {
      const nextElements = updater(current);
      const currentById = new Map(current.map((element) => [element.id, element]));
      const nextIds = new Set(nextElements.map((element) => element.id));
      const deleteIds = current.filter((element) => !nextIds.has(element.id)).map((element) => element.id);
      const upserts = nextElements.filter((element) => (
        JSON.stringify(currentById.get(element.id)) !== JSON.stringify(element)
      ));
      runtimeRef.current?.applyAnnotationChanges({ deleteIds, upserts });
      return nextElements;
    });
  }, []);

  const snapshot = useCallback((): LessonMaterialJson | null => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return null;
    }
    return runtime.snapshot();
  }, []);

  const publishHtmlGameInput = useCallback((event: MaterialHtmlGameInputEvent) => {
    runtimeRef.current?.publishHtmlGameInput(event);
  }, []);

  const publishHtmlGameEffect = useCallback((effect: MaterialHtmlGameEffect) => {
    runtimeRef.current?.publishHtmlGameEffect(effect);
  }, []);

  const publishHtmlGameSnapshot = useCallback((blockId: string, gameSnapshot: MaterialHtmlGameSnapshot) => {
    runtimeRef.current?.setHtmlGameSnapshot(blockId, gameSnapshot);
  }, []);

  const setHtmlGameAuthorityRun = useCallback((blockId: string, runId: string | null) => {
    runtimeRef.current?.updateHtmlGameAuthority(blockId, runId);
  }, []);

  const setPresentedHtmlGameBlock = useCallback((blockId: string | null) => {
    runtimeRef.current?.setHtmlGamePresentedBlock(blockId);
  }, []);

  const setMaterialAnswer = useCallback((blockId: string, answer: MaterialAnswerBlock) => {
    runtimeRef.current?.setMaterialAnswer(blockId, answer);
  }, []);

  const seedMaterialAnswers = useCallback((answers: MaterialAnswerState) => {
    runtimeRef.current?.seedMaterialAnswers(answers);
  }, []);

  const updateExerciseInteraction = useCallback((interaction: MaterialExerciseInteraction | null) => {
    if (JSON.stringify(exerciseInteractionRef.current) === JSON.stringify(interaction)) {
      return;
    }
    exerciseInteractionRef.current = interaction;
    runtimeRef.current?.updateExerciseInteraction(interaction);
  }, []);

  const htmlGameSync = useCallback((isAuthority: boolean): MaterialHtmlGameSync => ({
    authorityRuns: Object.fromEntries(participants
      .flatMap((participant) => Object.entries(participant.htmlGameAuthorityRuns))),
    effects: htmlGameEffects,
    inputs: htmlGameInputs,
    isAuthority,
    presentedBlockId: presentedHtmlGameBlockId,
    ready: status === "connected",
    publishEffect: publishHtmlGameEffect,
    publishInput: publishHtmlGameInput,
    publishSnapshot: publishHtmlGameSnapshot,
    setAuthorityRun: setHtmlGameAuthorityRun,
    setPresentedBlock: setPresentedHtmlGameBlock,
    snapshots: htmlGameSnapshots,
  }), [htmlGameEffects, htmlGameInputs, htmlGameSnapshots, participants, presentedHtmlGameBlockId, publishHtmlGameEffect, publishHtmlGameInput, publishHtmlGameSnapshot, setHtmlGameAuthorityRun, setPresentedHtmlGameBlock, status]);

  const exerciseSync = useMemo<MaterialExerciseSync>(() => ({
    answers: materialAnswers,
    participants: participants.flatMap((participant) => participant.exerciseInteraction ? [{
      clientId: participant.clientId,
      color: participant.color,
      interaction: participant.exerciseInteraction,
      name: participant.name,
    }] : []),
    ready: status === "connected",
    seedAnswers: seedMaterialAnswers,
    setAnswer: setMaterialAnswer,
    updateInteraction: updateExerciseInteraction,
  }), [materialAnswers, participants, seedMaterialAnswers, setMaterialAnswer, status, updateExerciseInteraction]);

  return {
    annotationElements,
    connected: status === "connected",
    participants,
    htmlGameSync,
    exerciseSync,
    setAnnotationElements,
    snapshot,
    status,
    text,
    updateCursor,
    updateText,
  };
}

function collaborationWebSocketUrl(tokenResponse: CollaborationDocumentToken): string {
  const base = tokenResponse.websocketUrl.startsWith("ws")
    ? new URL(tokenResponse.websocketUrl)
    : new URL(tokenResponse.websocketUrl, websocketOrigin());
  base.searchParams.set("room", tokenResponse.yjsDocumentId);
  base.searchParams.set("token", tokenResponse.token);
  return base.toString();
}

function websocketOrigin(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
}
