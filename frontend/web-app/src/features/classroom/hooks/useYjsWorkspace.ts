import { decodeRecoveryControl, encodeRecoveryProbe } from "../model/collaborationRecoveryProtocol";
import { observeConnection } from "../../../shared/routing/connectionDiagnostics";
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
  MaterialHtmlGameLifecycle,
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
import { createExternalActivityRealtimeClient } from "../model/externalActivityRealtimeClient";
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
  const annotationElementsRef = useRef<AnnotationElement[]>([]);
  const [text, setText] = useState("");
  const [htmlGameSnapshots, setHtmlGameSnapshots] = useState<Record<string, MaterialHtmlGameSnapshot>>({});
  const [htmlGameInputs, setHtmlGameInputs] = useState<MaterialHtmlGameInputEvent[]>([]);
  const [htmlGameEffects, setHtmlGameEffects] = useState<MaterialHtmlGameEffect[]>([]);
  const [htmlGamePatches, setHtmlGamePatches] = useState<MaterialHtmlGamePatch[]>([]);
  const [localHtmlGameAuthorityRuns, setLocalHtmlGameAuthorityRuns] = useState<Record<string, string>>({});
  const [htmlGameLifecycle, setHtmlGameLifecycle] = useState<MaterialHtmlGameLifecycle>({ stoppedRuns: {}, requests: {} });
  const [htmlGameLaunchId, setHtmlGameLaunchId] = useState<string | null>(null);
  const [presentedHtmlGameBlockId, setPresentedHtmlGameBlockId] = useState<string | null>(null);
  const [materialAnswers, setMaterialAnswers] = useState<MaterialAnswerState>({});
  const [materialViewport, setMaterialViewportState] = useState<MaterialViewportState | null>(null);
  const [videoPlaybackStates, setVideoPlaybackStates] = useState<Record<string, MaterialVideoPlaybackState>>({});
  const [workspaceClientId, setWorkspaceClientId] = useState<number | null>(null);
  const [annotationUndoState, setAnnotationUndoState] = useState({ canRedo: false, canUndo: false });
  const [reconnectCount, setReconnectCount] = useState(0);
  const retryConnectionRef = useRef<(() => void) | null>(null);
  const retryConnection = useCallback(() => retryConnectionRef.current?.(), []);
  const runtimeRef = useRef<YjsWorkspaceRuntime | null>(null);
  const exerciseInteractionRef = useRef<MaterialExerciseInteraction | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const gameSyncControllerRef = useRef<ReturnType<typeof createGameSyncSessionController> | null>(null);
  const externalActivityRealtime = useMemo(() => {
    if (!enabled || !document) return null;
    return createExternalActivityRealtimeClient({
      getUrl: async () => collaborationWebSocketUrl(
        await createCollaborationDocumentToken(document.lessonId, document.id),
      ),
    });
  }, [document?.id, document?.lessonId, enabled]);

  useEffect(() => {
    if (!enabled || !document) {
      annotationElementsRef.current = [];
      setAnnotationElementsState([]);
      setParticipants([]);
      setStatus("idle");
      setText("");
      setHtmlGameSnapshots({});
      setHtmlGameInputs([]);
      setHtmlGameEffects([]);
      setHtmlGamePatches([]);
      setPresentedHtmlGameBlockId(null);
      setHtmlGameLifecycle({ stoppedRuns: {}, requests: {} });
      setLocalHtmlGameAuthorityRuns({});
      setMaterialAnswers({});
      setMaterialViewportState(null);
      setVideoPlaybackStates({});
      setWorkspaceClientId(null);
      setAnnotationUndoState({ canRedo: false, canUndo: false });
      setReconnectCount(0);
      exerciseInteractionRef.current = null;
      return undefined;
    }

    let disposed = false;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;
    let connectInFlight = false;
    let generation = 0;
    let terminal = false;
    let recoveryDeadline: number | null = null;
    let probeTimer: number | null = null;
    let probeNonce: string | null = null;
    let probeSupported = false;
    const clearProbe = () => {
      if (probeTimer !== null) window.clearTimeout(probeTimer);
      probeTimer = null; probeNonce = null;
    };
    const clearDeadline = () => {
      if (recoveryDeadline !== null) window.clearTimeout(recoveryDeadline);
      recoveryDeadline = null;
    };
    let gameSyncController: ReturnType<typeof createGameSyncSessionController> | null = null;
    let latestHtmlGameSdkCheckpoints: Record<string, MaterialHtmlGameSdkCheckpoint> = {};
    const runtime = createYjsWorkspaceRuntime({
      color,
      onAnnotationChange: (elements) => {
        annotationElementsRef.current = elements;
        setAnnotationElementsState(elements);
      },
      onAnnotationUndoStateChange: setAnnotationUndoState,
      onHtmlGameEffectsChange: setHtmlGameEffects,
      onHtmlGameInputsChange: setHtmlGameInputs,
      onHtmlGamePatchesChange: setHtmlGamePatches,
      onHtmlGamePresentationChange: (blockId, launchId) => { setPresentedHtmlGameBlockId(blockId); setHtmlGameLaunchId(launchId ?? null); },
      onHtmlGameLifecycleChange: setHtmlGameLifecycle,
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
    setReconnectCount(0);

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };
    const armRecoveryDeadline = () => {
      if (recoveryDeadline === null && navigator.onLine && globalThis.document.visibilityState === "visible") {
        recoveryDeadline = window.setTimeout(() => {
          terminal = true; generation += 1; connectInFlight = false;
          clearReconnectTimer(); clearProbe();
          retireSocket(socketRef.current); socketRef.current = null; runtime.setSocket(null);
          setStatus("error");
        }, 30_000);
      }
    };
    const scheduleReconnect = () => {
      if (disposed || terminal || reconnectTimer !== null) return;
      armRecoveryDeadline();
      setStatus("reconnecting");
      setReconnectCount((current) => current + 1);
      const delay = realtimeReconnectDelayMs(reconnectAttempt);
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, delay);
    };
    const detachSocket = (socket: WebSocket) => {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
    };
    const retireSocket = (socket: WebSocket | null) => {
      if (!socket) return;
      detachSocket(socket);
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };
    const connect = async () => {
      if (connectInFlight || terminal) return;
      if (disposed || !navigator.onLine) {
        scheduleReconnect();
        return;
      }
      connectInFlight = true;
      const attemptGeneration = ++generation;
      let tokenTimer: number | null = null;
      clearReconnectTimer();
      setStatus(reconnectAttempt === 0 ? "connecting" : "reconnecting");
      try {
        const tokenResponse = await Promise.race([
          createCollaborationDocumentToken(document.lessonId, document.id),
          new Promise<never>((_resolve, reject) => {
            tokenTimer = window.setTimeout(() => reject(new Error("collaboration token timeout")), 5_000);
          }),
        ]);
        if (disposed || generation !== attemptGeneration || terminal) return;
        if (tokenResponse.documentId !== document.id) {
          terminal = true; setStatus("error"); onDocumentInvalid?.(document.id); return;
        }
        probeSupported = false; clearProbe();
        const socket = new WebSocket(collaborationWebSocketUrl(tokenResponse));
        socket.binaryType = "arraybuffer";
        const previous = socketRef.current;
        if (previous && previous !== socket) {
          retireSocket(previous);
        }
        socketRef.current = socket;
        socket.onopen = () => {
          if (disposed || generation !== attemptGeneration || socketRef.current !== socket) {
            socket.close();
            return;
          }
          observeConnection("collaboration", socket.url, true);
          runtime.startSocketSync(socket);
        };
        socket.onmessage = (event) => {
          if (socketRef.current === socket) {
            observeConnection("collaboration", socket.url, true);
            try {
              const control = decodeRecoveryControl(event.data);
              if (control?.type === "hello") { probeSupported = true; return; }
              if (control?.type === "ack") {
                if (control.nonce === probeNonce) { clearProbe(); clearDeadline(); }
                return;
              }
              runtime.handleSocketMessage(event.data);
              if (event.data instanceof ArrayBuffer && new Uint8Array(event.data)[0] === 0) {
                reconnectAttempt = 0; clearDeadline(); setStatus("connected");
              }
            } catch { socket.close(); }
          }
        };
        socket.onclose = (event) => {
          if (socketRef.current !== socket) return;
          clearProbe();
          if (event.code === 4404 || event.code === 4409 || event.code === 1008) {
            terminal = true; clearDeadline(); clearReconnectTimer(); setStatus("error");
            if (event.code === 4404) onDocumentInvalid?.(document.id);
          }
          observeConnection("collaboration", socket.url, false);
          socketRef.current = null;
          runtime.setSocket(null);
          if (!disposed) scheduleReconnect();
        };
        socket.onerror = () => {
          if (!disposed && socketRef.current === socket) setStatus("error");
          socket.close();
        };
      } catch (caught) {
        if (!disposed && generation === attemptGeneration) {
          if (isInvalidCollaborationDocumentError(caught) || isApiStatus(caught, 403) || isApiStatus(caught, 401)) {
            terminal = true; clearDeadline();
            setStatus("error");
            onDocumentInvalid?.(document.id);
            return;
          }
          setStatus("error");
          scheduleReconnect();
        }
      } finally {
        if (tokenTimer !== null) window.clearTimeout(tokenTimer);
        if (generation === attemptGeneration) connectInFlight = false;
      }
    };
    let lastProbeAt = -Infinity;
    const reconnectNow = () => {
      if (disposed || terminal || !navigator.onLine || globalThis.document.visibilityState !== "visible") return;
      const current = socketRef.current;
      if (connectInFlight) return;
      if (current?.readyState === WebSocket.OPEN && !probeSupported) return;
      if (current?.readyState === WebSocket.OPEN || current?.readyState === WebSocket.CONNECTING) {
        if (probeTimer !== null) return;
        armRecoveryDeadline();
        const remaining = 5_000 - (performance.now() - lastProbeAt);
        if (remaining > 0) {
          probeTimer = window.setTimeout(() => { probeTimer = null; reconnectNow(); }, remaining);
          return;
        }
        lastProbeAt = performance.now();
        if (current.readyState === WebSocket.OPEN) {
          const nonce = window.crypto.randomUUID().replace(/-/g, "").slice(0, 16);
          probeNonce = nonce;
          current.send(encodeRecoveryProbe(nonce));
        }
        probeTimer = window.setTimeout(() => {
          clearProbe();
          if (disposed || terminal || socketRef.current !== current || globalThis.document.visibilityState !== "visible" || !navigator.onLine) return;
          retireSocket(current); socketRef.current = null; runtime.setSocket(null);
          scheduleReconnect();
        }, 5_000);
        return;
      }
      clearReconnectTimer();
      void connect();
    };
    const handleVisibilityChange = () => {
      if (globalThis.document.visibilityState === "visible") reconnectNow();
      else { clearProbe(); clearDeadline(); }
    };
    retryConnectionRef.current = () => {
      if (disposed) return;
      terminal = false; generation += 1; connectInFlight = false;
      clearProbe(); clearDeadline(); clearReconnectTimer();
      retireSocket(socketRef.current); socketRef.current = null; runtime.setSocket(null);
      void connect();
    };
    window.addEventListener("online", reconnectNow);
    globalThis.document.addEventListener("visibilitychange", handleVisibilityChange);
    void connect();

    return () => {
      disposed = true; generation += 1;
      retryConnectionRef.current = null;
      clearProbe(); clearDeadline();
      clearReconnectTimer();
      window.removeEventListener("online", reconnectNow);
      globalThis.document.removeEventListener("visibilitychange", handleVisibilityChange);
      retireSocket(socketRef.current);
      socketRef.current = null;
      runtime.setSocket(null);
      runtime.destroy();
      gameSyncController.close();
      gameRealtime.close();
      externalActivityRealtime?.close();
      gameSyncControllerRef.current = null;
      runtimeRef.current = null;
      annotationElementsRef.current = [];
      setAnnotationElementsState([]);
      setParticipants([]);
      setHtmlGameSnapshots({});
      setHtmlGameInputs([]);
      setHtmlGameEffects([]);
      setHtmlGamePatches([]);
      setPresentedHtmlGameBlockId(null);
      setHtmlGameLifecycle({ stoppedRuns: {}, requests: {} });
      setLocalHtmlGameAuthorityRuns({});
      setMaterialAnswers({});
      setMaterialViewportState(null);
      setVideoPlaybackStates({});
      setWorkspaceClientId(null);
      setAnnotationUndoState({ canRedo: false, canUndo: false });
      exerciseInteractionRef.current = null;
    };
  }, [color, document?.id, enabled, externalActivityRealtime, onDocumentInvalid, participantName]);

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
    const current = annotationElementsRef.current;
    const nextElements = updater(current);
    const runtime = runtimeRef.current;
    if (!runtime) {
      annotationElementsRef.current = nextElements;
      setAnnotationElementsState(nextElements);
      return;
    }
    const currentById = new Map(current.map((element) => [element.id, element]));
    const nextIds = new Set(nextElements.map((element) => element.id));
    const deleteIds = current.filter((element) => !nextIds.has(element.id)).map((element) => element.id);
    const upserts = nextElements.filter((element) => (
      JSON.stringify(currentById.get(element.id)) !== JSON.stringify(element)
    ));
    // Yjs publishes the canonical result synchronously to the observer above.
    // Never write to the document from a React updater, which React may replay.
    if (deleteIds.length || upserts.length) runtime.applyAnnotationChanges({ deleteIds, upserts });
  }, [document?.id]);

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
    setLocalHtmlGameAuthorityRuns((current) => {
      const next = { ...current };
      if (runId) next[blockId] = runId; else delete next[blockId];
      return next;
    });
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

  const stopHtmlGameRun = useCallback((blockId: string, runId: string, launchId?: string) => {
    runtimeRef.current?.stopHtmlGameRun(blockId, runId, launchId);
  }, []);

  const htmlGameSyncByRole = useMemo(() => {
    const shared = {
      lifecycle: htmlGameLifecycle,
      launchId: htmlGameLaunchId,
      stopRun: stopHtmlGameRun,
      authorityRuns: { ...Object.fromEntries(participants
        .flatMap((participant) => Object.entries(participant.htmlGameAuthorityRuns))), ...localHtmlGameAuthorityRuns },
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
  }, [localHtmlGameAuthorityRuns, htmlGameLaunchId, htmlGameLifecycle, stopHtmlGameRun, htmlGameEffects, htmlGameInputs, htmlGamePatches, htmlGameSnapshots, participants, presentedHtmlGameBlockId, publishHtmlGameEffect, publishHtmlGameInput, publishHtmlGamePatch, publishHtmlGameSnapshot, setHtmlGameAuthorityRun, setPresentedHtmlGameBlock, status, workspaceClientId]);
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
    reconnectCount,
    retryConnection,
    htmlGameSync,
    externalActivityRealtime,
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
