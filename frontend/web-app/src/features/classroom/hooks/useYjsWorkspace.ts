import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createCollaborationDocumentToken,
  isApiStatus,
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
import type {
  MaterialHtmlGameEffect,
  MaterialHtmlGameInputEvent,
  MaterialHtmlGamePatch,
  MaterialHtmlGameSdkCheckpoint,
  MaterialHtmlGameSnapshot,
  MaterialHtmlGameSync,
} from "../../materials/model/materialDocument";
import type {
  MaterialAnswerBlock,
  MaterialAnswerState,
  MaterialExerciseInteraction,
  MaterialExerciseSync,
  MaterialVideoPlaybackAction,
  MaterialVideoPlaybackState,
  MaterialVideoSync,
} from "../../materials/model/types";
import type {
  MaterialViewportPublishOptions,
  MaterialViewportState,
  MaterialViewportUpdate,
} from "../model/materialViewport";
import { realtimeReconnectDelayMs } from "../model/realtimeLifecycle";
import { createGameRealtimeClient } from "../model/gameRealtimeClient";
import { createGameSyncSessionController } from "../model/gameSyncSessionController";

export type { CollaborationCursor, CollaborationParticipant };

export type YjsWorkspaceStatus = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

export function useYjsWorkspace({
  color,
  document,
  enabled = true,
  onDocumentInvalid,
  participantName,
}: {
  color: string;
  document: CollaborationDocument | null;
  enabled?: boolean;
  onDocumentInvalid?: (documentId: string) => void;
  participantName: string;
}) {
  const [participants, setParticipants] = useState<CollaborationParticipant[]>([]);
  const [status, setStatus] = useState<YjsWorkspaceStatus>("idle");
  const [annotationElements, setAnnotationElementsState] = useState<AnnotationElement[]>([]);
  const [text, setText] = useState("");
  const [htmlGameSnapshots, setHtmlGameSnapshots] = useState<Record<string, MaterialHtmlGameSnapshot>>({});
  const [htmlGameInputs, setHtmlGameInputs] = useState<MaterialHtmlGameInputEvent[]>([]);
  const [htmlGameEffects, setHtmlGameEffects] = useState<MaterialHtmlGameEffect[]>([]);
  const [htmlGamePatches, setHtmlGamePatches] = useState<MaterialHtmlGamePatch[]>([]);
  const [presentedHtmlGameBlockId, setPresentedHtmlGameBlockId] = useState<string | null>(null);
  const [materialAnswers, setMaterialAnswers] = useState<MaterialAnswerState>({});
  const [materialViewport, setMaterialViewportState] = useState<MaterialViewportState | null>(null);
  const [videoPlaybackStates, setVideoPlaybackStates] = useState<Record<string, MaterialVideoPlaybackState>>({});
  const [workspaceClientId, setWorkspaceClientId] = useState<number | null>(null);
  const [annotationUndoState, setAnnotationUndoState] = useState({ canRedo: false, canUndo: false });
  const runtimeRef = useRef<YjsWorkspaceRuntime | null>(null);
  const exerciseInteractionRef = useRef<MaterialExerciseInteraction | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const gameSyncControllerRef = useRef<ReturnType<typeof createGameSyncSessionController> | null>(null);

  useEffect(() => {
    if (!enabled || !document) {
      setAnnotationElementsState([]);
      setParticipants([]);
      setStatus("idle");
      setText("");
      setHtmlGameSnapshots({});
      setHtmlGameInputs([]);
      setHtmlGameEffects([]);
      setHtmlGamePatches([]);
      setPresentedHtmlGameBlockId(null);
      setMaterialAnswers({});
      setMaterialViewportState(null);
      setVideoPlaybackStates({});
      setWorkspaceClientId(null);
      setAnnotationUndoState({ canRedo: false, canUndo: false });
      exerciseInteractionRef.current = null;
      return undefined;
    }

    let disposed = false;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;
    let gameSyncController: ReturnType<typeof createGameSyncSessionController> | null = null;
    let latestHtmlGameSdkCheckpoints: Record<string, MaterialHtmlGameSdkCheckpoint> = {};
    const runtime = createYjsWorkspaceRuntime({
      color,
      onAnnotationChange: setAnnotationElementsState,
      onAnnotationUndoStateChange: setAnnotationUndoState,
      onHtmlGameEffectsChange: setHtmlGameEffects,
      onHtmlGameInputsChange: setHtmlGameInputs,
      onHtmlGamePatchesChange: setHtmlGamePatches,
      onHtmlGamePresentationChange: setPresentedHtmlGameBlockId,
      onHtmlGameSdkCheckpointsChange: (checkpoints) => {
        latestHtmlGameSdkCheckpoints = checkpoints;
        gameSyncController?.replaceCheckpoints(checkpoints);
      },
      onHtmlGameSdkMessage: (message) => gameSyncController?.receiveFallback(message),
      onHtmlGameSnapshotsChange: setHtmlGameSnapshots,
      onMaterialAnswersChange: setMaterialAnswers,
      onMaterialViewportChange: setMaterialViewportState,
      onVideoPlaybackChange: setVideoPlaybackStates,
      onParticipantsChange: setParticipants,
      onTextChange: setText,
      participantName,
      snapshot: document.snapshot,
    });
    runtimeRef.current = runtime;
    const gameRealtime = createGameRealtimeClient({
      fallback: (message) => {
        if (message.kind === "action-request") {
          runtime.publishHtmlGameSdkRequest(message.request);
        } else if (message.kind === "ordered-action") {
          runtime.publishHtmlGameSdkAction(message.action);
        } else if (message.kind === "effect") {
          runtime.publishHtmlGameSdkEffect(message.effect);
        }
      },
      getActorId: () => String(runtime.getClientId()),
      getUrl: async () => collaborationWebSocketUrl(
        await createCollaborationDocumentToken(document.lessonId, document.id),
      ),
    });
    gameSyncController = createGameSyncSessionController({
      publishCheckpoint: (blockId, checkpoint) => {
        runtime.setHtmlGameSdkCheckpoint(blockId, checkpoint);
      },
      realtime: gameRealtime,
    });
    gameSyncController.replaceCheckpoints(latestHtmlGameSdkCheckpoints);
    gameSyncControllerRef.current = gameSyncController;
    setWorkspaceClientId(runtime.getClientId());
    setStatus("connecting");

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };
    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== null) return;
      setStatus("reconnecting");
      const delay = realtimeReconnectDelayMs(reconnectAttempt);
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, delay);
    };
    const connect = async () => {
      if (disposed || !navigator.onLine) {
        scheduleReconnect();
        return;
      }
      clearReconnectTimer();
      setStatus(reconnectAttempt === 0 ? "connecting" : "reconnecting");
      try {
        const tokenResponse = await createCollaborationDocumentToken(document.lessonId, document.id);
        if (disposed) return;
        const socket = new WebSocket(collaborationWebSocketUrl(tokenResponse));
        socket.binaryType = "arraybuffer";
        socketRef.current = socket;
        socket.onopen = () => {
          if (disposed || socketRef.current !== socket) {
            socket.close();
            return;
          }
          reconnectAttempt = 0;
          setStatus("connected");
          runtime.startSocketSync(socket);
        };
        socket.onmessage = (event) => {
          if (socketRef.current === socket) runtime.handleSocketMessage(event.data);
        };
        socket.onclose = () => {
          if (socketRef.current === socket) {
            socketRef.current = null;
            runtime.setSocket(null);
          }
          if (!disposed) scheduleReconnect();
        };
        socket.onerror = () => {
          if (!disposed && socketRef.current === socket) setStatus("error");
          socket.close();
        };
      } catch (caught) {
        if (!disposed) {
          if (isInvalidCollaborationDocumentError(caught)) {
            setStatus("error");
            onDocumentInvalid?.(document.id);
            return;
          }
          setStatus("error");
          scheduleReconnect();
        }
      }
    };
    const reconnectNow = () => {
      if (disposed) return;
      clearReconnectTimer();
      const current = socketRef.current;
      if (current?.readyState === WebSocket.OPEN || current?.readyState === WebSocket.CONNECTING) return;
      void connect();
    };
    const handleVisibilityChange = () => {
      if (globalThis.document.visibilityState === "visible") reconnectNow();
    };
    window.addEventListener("online", reconnectNow);
    globalThis.document.addEventListener("visibilitychange", handleVisibilityChange);
    void connect();

    return () => {
      disposed = true;
      clearReconnectTimer();
      window.removeEventListener("online", reconnectNow);
      globalThis.document.removeEventListener("visibilitychange", handleVisibilityChange);
      socketRef.current?.close();
      socketRef.current = null;
      runtime.setSocket(null);
      runtime.destroy();
      gameSyncController.close();
      gameRealtime.close();
      gameSyncControllerRef.current = null;
      runtimeRef.current = null;
      setAnnotationElementsState([]);
      setParticipants([]);
      setHtmlGameSnapshots({});
      setHtmlGameInputs([]);
      setHtmlGameEffects([]);
      setHtmlGamePatches([]);
      setPresentedHtmlGameBlockId(null);
      setMaterialAnswers({});
      setMaterialViewportState(null);
      setVideoPlaybackStates({});
      setWorkspaceClientId(null);
      setAnnotationUndoState({ canRedo: false, canUndo: false });
      exerciseInteractionRef.current = null;
    };
  }, [color, document?.id, enabled, onDocumentInvalid, participantName]);

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

  const undoAnnotation = useCallback(() => runtimeRef.current?.undoAnnotation(), []);
  const redoAnnotation = useCallback(() => runtimeRef.current?.redoAnnotation(), []);

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

  const publishHtmlGamePatch = useCallback((patch: MaterialHtmlGamePatch) => {
    runtimeRef.current?.publishHtmlGamePatch(patch);
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

  const setMaterialViewport = useCallback((
    viewport: MaterialViewportUpdate,
    options?: MaterialViewportPublishOptions,
  ) => {
    runtimeRef.current?.setMaterialViewport(viewport, options);
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

  const setVideoPlayback = useCallback((
    blockId: string,
    state: { action: MaterialVideoPlaybackAction; playing: boolean; positionSeconds: number },
    options?: { heartbeat?: boolean },
  ) => {
    runtimeRef.current?.setVideoPlayback(blockId, state, options);
  }, []);

  const htmlGameSyncByRole = useMemo(() => {
    const shared = {
      authorityRuns: Object.fromEntries(participants
        .flatMap((participant) => Object.entries(participant.htmlGameAuthorityRuns))),
      clientId: workspaceClientId,
      effects: htmlGameEffects,
      inputs: htmlGameInputs,
      patches: htmlGamePatches,
      presentedBlockId: presentedHtmlGameBlockId,
      ready: status === "connected",
      publishEffect: publishHtmlGameEffect,
      publishInput: publishHtmlGameInput,
      publishPatch: publishHtmlGamePatch,
      publishSnapshot: publishHtmlGameSnapshot,
      sdkChannel: gameSyncControllerRef.current ?? undefined,
      setAuthorityRun: setHtmlGameAuthorityRun,
      setPresentedBlock: setPresentedHtmlGameBlock,
      snapshots: htmlGameSnapshots,
    };
    return {
      authority: { ...shared, isAuthority: true } satisfies MaterialHtmlGameSync,
      replica: { ...shared, isAuthority: false } satisfies MaterialHtmlGameSync,
    };
  }, [htmlGameEffects, htmlGameInputs, htmlGamePatches, htmlGameSnapshots, participants, presentedHtmlGameBlockId, publishHtmlGameEffect, publishHtmlGameInput, publishHtmlGamePatch, publishHtmlGameSnapshot, setHtmlGameAuthorityRun, setPresentedHtmlGameBlock, status, workspaceClientId]);
  const htmlGameSync = useCallback(
    (isAuthority: boolean): MaterialHtmlGameSync => (
      isAuthority ? htmlGameSyncByRole.authority : htmlGameSyncByRole.replica
    ),
    [htmlGameSyncByRole],
  );

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

  const videoSync = useMemo<MaterialVideoSync>(() => ({
    clientId: workspaceClientId,
    publish: setVideoPlayback,
    ready: status === "connected",
    states: videoPlaybackStates,
  }), [setVideoPlayback, status, videoPlaybackStates, workspaceClientId]);

  return {
    annotationElements,
    annotationUndoState,
    connected: status === "connected",
    participants,
    htmlGameSync,
    exerciseSync,
    videoSync,
    materialViewport,
    workspaceClientId,
    setAnnotationElements,
    redoAnnotation,
    snapshot,
    status,
    setMaterialViewport,
    text,
    updateCursor,
    updateText,
    undoAnnotation,
  };
}

export function isInvalidCollaborationDocumentError(caught: unknown): boolean {
  return isApiStatus(caught, 404) || isApiStatus(caught, 410);
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

