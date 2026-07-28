import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gamepad2, Loader2 } from "lucide-react";
import {
  classifyGameHtml,
  GAME_SYNC_LIMITS,
  type GameActionRequest,
  type GameSyncInboundMessage,
  type GameSyncOutboundMessage,
  type OrderedGameAction,
} from "@playsay/game-sync";
import type {
  MaterialHtmlGameEffect,
  MaterialHtmlGameInputEvent,
  MaterialHtmlGamePatchOperation,
  MaterialHtmlGameSnapshot,
  MaterialHtmlGameSync,
} from "../../model/materialDocument";
import { useAppTranslation } from "../../../../shared/i18n";

type BridgeMessage =
  | {
      canvases?: Record<string, string>;
      channel: string;
      controls?: Record<string, {
        checked?: boolean;
        selectedIndex?: number;
        selectionEnd?: number | null;
        selectionStart?: number | null;
        value?: string;
      }>;
      html: string;
      scroll?: Record<string, { left: number; top: number }>;
      sequence: number;
      type: "snapshot";
    }
  | { channel: string; mirror: boolean; type: "ready" }
  | { channel: string; runId?: string; sequence: number; type: "snapshotApplied" }
  | { channel: string; operations: MaterialHtmlGamePatchOperation[]; sequence: number; type: "patch" }
  | { channel: string; runId?: string; sequence: number; type: "patchRejected" }
  | { channel: string; type: "sdkReady" }
  | { channel: string; message: string; type: "runtimeError" }
  | { channel: string; type: "runtimeReady" }
  | { channel: string; type: "input"; event: Omit<MaterialHtmlGameInputEvent, "id" | "at" | "blockId"> }
  | { channel: string; type: "effect"; effect: Omit<MaterialHtmlGameEffect, "id" | "at" | "blockId"> };

const MIRROR_SNAPSHOT_RETRY_MS = 750;
const MIRROR_RECOVERY_SNAPSHOT_MS = 5_000;

export type HtmlGameRuntimeStatus = "checking" | "ready" | "failed";

function seedFromRunId(runId: string): number {
  let seed = 0x811c9dc5;
  for (let index = 0; index < runId.length; index += 1) {
    seed ^= runId.charCodeAt(index);
    seed = Math.imul(seed, 0x01000193);
  }
  return seed >>> 0;
}

function serializedMessageBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function orderSdkAction(
  request: GameActionRequest & { at: number; blockId: string; id: string },
  revision: { current: number },
  logicalTime: { current: number },
): OrderedGameAction & { at: number; blockId: string; id: string } {
  revision.current += 1;
  logicalTime.current += 1;
  return {
    ...request,
    authorityRevision: revision.current,
    logicalTime: logicalTime.current,
  };
}

export function HtmlGameFrame({
  blockId,
  fillAvailable = false,
  height,
  html,
  onRuntimeStatusChange,
  sync,
  title,
}: {
  blockId: string;
  fillAvailable?: boolean;
  height: number;
  html?: string;
  onRuntimeStatusChange?: (status: HtmlGameRuntimeStatus) => void;
  sync?: MaterialHtmlGameSync;
  title: string;
}) {
  const { t } = useAppTranslation();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const channel = useMemo(() => crypto.randomUUID(), [blockId, html]);
  const sdkRuntime = Boolean(html && classifyGameHtml(html) === "SDK_V1");
  const isMirror = Boolean(sync && !sync.isAuthority && !sdkRuntime);
  const authorityRunId = sync?.authorityRuns[blockId];
  const predictiveMirror = Boolean(isMirror && html && supportsPredictiveHtmlGame(html));
  const runtimeRunId = (isMirror || (sdkRuntime && !sync?.isAuthority))
    ? authorityRunId ?? blockId
    : channel;
  const srcDoc = useMemo(
    () => html ? createSandboxedGameDocument(html, channel, isMirror, runtimeRunId, predictiveMirror) : "",
    [channel, html, isMirror, predictiveMirror, runtimeRunId],
  );
  const handledInputsRef = useRef<Set<string> | null>(null);
  const latestInputSequenceRef = useRef<Map<string, number>>(new Map());
  const nextInputSequenceRef = useRef(0);
  const handledEffectsRef = useRef<Set<string> | null>(null);
  const handledPatchesRef = useRef<Set<string> | null>(null);
  const sdkPortRef = useRef<MessagePort | null>(null);
  const handledSdkActionsRef = useRef(new Set<string>());
  const handledSdkEffectsRef = useRef(new Set<string>());
  const handledSdkRequestsRef = useRef(new Set<string>());
  const sdkRevisionRef = useRef(0);
  const sdkLogicalTimeRef = useRef(0);
  const mirrorReadyRef = useRef(false);
  const pendingMirrorSnapshotRef = useRef<MaterialHtmlGameSnapshot | null>(null);
  const mirrorSnapshotRetryRef = useRef<number | null>(null);
  const lastMirrorSnapshotAppliedAtRef = useRef(0);
  const [appliedAuthorityRunId, setAppliedAuthorityRunId] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<HtmlGameRuntimeStatus>("checking");
  const activeSnapshot = sync?.snapshots[blockId];
  const authorityAvailable = sdkRuntime
    ? !sync || sync.isAuthority || Boolean(authorityRunId)
    : !isMirror || Boolean(
      authorityRunId &&
      activeSnapshot?.runId === authorityRunId &&
      appliedAuthorityRunId === authorityRunId,
    );

  const clearMirrorSnapshotRetry = useCallback(() => {
    if (mirrorSnapshotRetryRef.current !== null) {
      window.clearTimeout(mirrorSnapshotRetryRef.current);
      mirrorSnapshotRetryRef.current = null;
    }
  }, []);

  const sendMirrorSnapshot = useCallback((snapshot: MaterialHtmlGameSnapshot | undefined) => {
    if (
      !isMirror ||
      !mirrorReadyRef.current ||
      !snapshot ||
      !authorityRunId ||
      snapshot.runId !== authorityRunId
    ) {
      return;
    }

    pendingMirrorSnapshotRef.current = snapshot;
    iframeRef.current?.contentWindow?.postMessage({ channel, type: "applySnapshot", snapshot }, "*");
    clearMirrorSnapshotRetry();
    mirrorSnapshotRetryRef.current = window.setTimeout(() => {
      if (pendingMirrorSnapshotRef.current?.sequence === snapshot.sequence) {
        sendMirrorSnapshot(pendingMirrorSnapshotRef.current);
      }
    }, MIRROR_SNAPSHOT_RETRY_MS);
  }, [authorityRunId, channel, clearMirrorSnapshotRetry, isMirror]);

  useEffect(() => {
    handledInputsRef.current = null;
    latestInputSequenceRef.current = new Map();
    nextInputSequenceRef.current = 0;
    handledEffectsRef.current = null;
    handledPatchesRef.current = null;
    handledSdkActionsRef.current = new Set();
    handledSdkEffectsRef.current = new Set();
    handledSdkRequestsRef.current = new Set();
    sdkRevisionRef.current = 0;
    sdkLogicalTimeRef.current = 0;
    sdkPortRef.current?.close();
    sdkPortRef.current = null;
    mirrorReadyRef.current = false;
    pendingMirrorSnapshotRef.current = null;
    lastMirrorSnapshotAppliedAtRef.current = 0;
    clearMirrorSnapshotRetry();
    setAppliedAuthorityRunId(null);
    setRuntimeStatus("checking");
  }, [blockId, channel, clearMirrorSnapshotRetry, sync?.isAuthority]);

  useEffect(() => {
    onRuntimeStatusChange?.(runtimeStatus);
  }, [onRuntimeStatusChange, runtimeStatus]);

  useEffect(() => () => clearMirrorSnapshotRetry(), [clearMirrorSnapshotRetry]);

  useEffect(() => () => {
    sdkPortRef.current?.close();
    sdkPortRef.current = null;
  }, []);

  useEffect(() => {
    if (!isMirror) {
      return;
    }
    pendingMirrorSnapshotRef.current = null;
    handledInputsRef.current = null;
    handledPatchesRef.current = null;
    latestInputSequenceRef.current = new Map();
    clearMirrorSnapshotRetry();
    setAppliedAuthorityRunId(null);
  }, [authorityRunId, clearMirrorSnapshotRetry, isMirror]);

  useEffect(() => {
    if (!html || !sync?.isAuthority || !sync.ready) {
      return undefined;
    }
    sync.setAuthorityRun(blockId, channel);
    return () => sync.setAuthorityRun(blockId, null);
  }, [blockId, channel, html, sync?.isAuthority, sync?.ready, sync?.setAuthorityRun]);

  useEffect(() => {
    function handleMessage(messageEvent: MessageEvent<BridgeMessage>) {
      if (messageEvent.source !== iframeRef.current?.contentWindow || messageEvent.data?.channel !== channel) {
        return;
      }
      const message = messageEvent.data;
      if (message.type === "snapshot" && sync?.isAuthority) {
        sync.publishSnapshot(blockId, {
          canvases: message.canvases,
          controls: message.controls,
          html: message.html,
          runId: channel,
          scroll: message.scroll,
          sequence: message.sequence,
          updatedAt: Date.now(),
        });
      } else if (message.type === "ready" && isMirror && message.mirror) {
        mirrorReadyRef.current = true;
        sendMirrorSnapshot(activeSnapshot);
      } else if (message.type === "snapshotApplied" && isMirror) {
        const pendingSnapshot = pendingMirrorSnapshotRef.current;
        if (
          authorityRunId &&
          message.runId === authorityRunId &&
          activeSnapshot?.runId === authorityRunId
        ) {
          setAppliedAuthorityRunId(authorityRunId);
          lastMirrorSnapshotAppliedAtRef.current = Date.now();
        }
        if (
          pendingSnapshot &&
          pendingSnapshot.runId === message.runId &&
          message.sequence >= pendingSnapshot.sequence
        ) {
          pendingMirrorSnapshotRef.current = null;
          clearMirrorSnapshotRetry();
        }
      } else if (message.type === "input" && sync) {
        const input = {
          ...message.event,
          actorId: channel,
          at: Date.now(),
          blockId,
          id: crypto.randomUUID(),
          runId: sync.isAuthority ? channel : sync.authorityRuns[blockId],
          sequence: ++nextInputSequenceRef.current,
        };
        (handledInputsRef.current ??= new Set()).add(input.id);
        latestInputSequenceRef.current.set(channel, input.sequence);
        sync.publishInput(input);
      } else if (message.type === "patch" && sync?.isAuthority && sync.publishPatch) {
        sync.publishPatch({
          at: Date.now(),
          blockId,
          id: crypto.randomUUID(),
          operations: message.operations,
          runId: channel,
          sequence: message.sequence,
        });
      } else if (message.type === "patchRejected" && isMirror) {
        sendMirrorSnapshot(activeSnapshot);
      } else if (message.type === "effect" && sync?.isAuthority) {
        sync.publishEffect({
          ...message.effect,
          at: Date.now(),
          blockId,
          id: crypto.randomUUID(),
        });
      } else if (message.type === "runtimeError") {
        setRuntimeStatus("failed");
      } else if (message.type === "runtimeReady" && !sdkRuntime) {
        setRuntimeStatus((current) => current === "failed" ? current : "ready");
      } else if (message.type === "sdkReady" && sdkRuntime) {
        sdkPortRef.current?.close();
        const ports = new MessageChannel();
        sdkPortRef.current = ports.port1;
        ports.port1.onmessage = (event: MessageEvent<GameSyncOutboundMessage>) => {
          const outbound = event.data;
          if (outbound.kind === "hello") {
            const checkpoint = sync?.sdkCheckpoints[blockId];
            const context: GameSyncInboundMessage = {
              actorId: String(sync?.clientId ?? channel),
              checkpoint: checkpoint?.runId === runtimeRunId ? checkpoint : undefined,
              kind: "context",
              runId: runtimeRunId,
              seed: seedFromRunId(runtimeRunId),
            };
            ports.port1.postMessage(context);
            setRuntimeStatus((current) => current === "failed" ? current : "ready");
          } else if (outbound.kind === "action-request") {
            if (serializedMessageBytes(outbound.action) > GAME_SYNC_LIMITS.actionBytes) {
              ports.port1.postMessage({
                code: "ACTION_TOO_LARGE",
                eventId: outbound.action.eventId,
                kind: "rejected",
              } satisfies GameSyncInboundMessage);
              return;
            }
            const request = {
              ...outbound.action,
              at: Date.now(),
              blockId,
              id: outbound.action.eventId,
              runId: runtimeRunId,
            };
            if (!sync || sync.isAuthority) {
              const action = orderSdkAction(request, sdkRevisionRef, sdkLogicalTimeRef);
              handledSdkActionsRef.current.add(action.id);
              ports.port1.postMessage({ action, kind: "ordered-action" } satisfies GameSyncInboundMessage);
              sync?.publishSdkAction(action);
            } else {
              sync.publishSdkRequest(request);
            }
          } else if (outbound.kind === "effect") {
            if (serializedMessageBytes(outbound.effect) > GAME_SYNC_LIMITS.effectBytes) {
              return;
            }
            const effect = {
              ...outbound.effect,
              at: Date.now(),
              blockId,
              id: outbound.effect.effectId,
              runId: runtimeRunId,
            };
            handledSdkEffectsRef.current.add(effect.id);
            sync?.publishSdkEffect(effect);
          } else if (outbound.kind === "checkpoint" && (!sync || sync.isAuthority)) {
            if (serializedMessageBytes(outbound.checkpoint) > GAME_SYNC_LIMITS.checkpointBytes) {
              return;
            }
            const checkpoint = {
              ...outbound.checkpoint,
              runId: runtimeRunId,
              updatedAt: Date.now(),
            };
            if (sync) {
              sync.publishSdkCheckpoint(blockId, checkpoint);
            }
          }
        };
        ports.port1.start();
        iframeRef.current?.contentWindow?.postMessage(
          { channel, type: "playsay-sdk-connect" },
          "*",
          [ports.port2],
        );
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [activeSnapshot, authorityRunId, blockId, channel, isMirror, runtimeRunId, sdkRuntime, sendMirrorSnapshot, sync]);

  useEffect(() => {
    if (!sdkRuntime || !sync?.isAuthority) {
      return;
    }
    const existingActions = sync.sdkActions
      .filter((action) => action.blockId === blockId && action.runId === runtimeRunId);
    const checkpoint = sync.sdkCheckpoints[blockId];
    sdkRevisionRef.current = Math.max(
      sdkRevisionRef.current,
      checkpoint?.runId === runtimeRunId ? checkpoint.revision : 0,
      ...existingActions.map((action) => action.authorityRevision),
    );
    sdkLogicalTimeRef.current = Math.max(
      sdkLogicalTimeRef.current,
      checkpoint?.runId === runtimeRunId ? checkpoint.logicalTime : 0,
      ...existingActions.map((action) => action.logicalTime),
    );
    const orderedEventIds = new Set(existingActions.map((action) => action.eventId));
    const requests = sync.sdkRequests
      .filter((request) => request.blockId === blockId && request.runId === runtimeRunId)
      .sort((left, right) => left.at - right.at || left.actorSequence - right.actorSequence);
    requests.forEach((request) => {
      if (handledSdkRequestsRef.current.has(request.id) || orderedEventIds.has(request.eventId)) {
        return;
      }
      handledSdkRequestsRef.current.add(request.id);
      const action = orderSdkAction(request, sdkRevisionRef, sdkLogicalTimeRef);
      handledSdkActionsRef.current.add(action.id);
      sdkPortRef.current?.postMessage({ action, kind: "ordered-action" } satisfies GameSyncInboundMessage);
      sync.publishSdkAction(action);
    });
  }, [blockId, runtimeRunId, sdkRuntime, sync, sync?.isAuthority, sync?.sdkRequests]);

  useEffect(() => {
    if (!sdkRuntime || !sync) {
      return;
    }
    const checkpointRevision = sync.sdkCheckpoints[blockId]?.runId === runtimeRunId
      ? sync.sdkCheckpoints[blockId]?.revision ?? 0
      : 0;
    sync.sdkActions
      .filter((action) => (
        action.blockId === blockId &&
        action.runId === runtimeRunId &&
        action.authorityRevision > checkpointRevision
      ))
      .sort((left, right) => left.authorityRevision - right.authorityRevision)
      .forEach((action) => {
        sdkRevisionRef.current = Math.max(sdkRevisionRef.current, action.authorityRevision);
        sdkLogicalTimeRef.current = Math.max(sdkLogicalTimeRef.current, action.logicalTime);
        if (handledSdkActionsRef.current.has(action.id)) {
          return;
        }
        handledSdkActionsRef.current.add(action.id);
        sdkPortRef.current?.postMessage({ action, kind: "ordered-action" } satisfies GameSyncInboundMessage);
      });
  }, [blockId, runtimeRunId, sdkRuntime, sync, sync?.sdkActions, sync?.sdkCheckpoints]);

  useEffect(() => {
    if (!sdkRuntime || !sync) {
      return;
    }
    sync.sdkEffects
      .filter((effect) => effect.blockId === blockId && effect.runId === runtimeRunId)
      .forEach((effect) => {
        if (handledSdkEffectsRef.current.has(effect.id)) {
          return;
        }
        handledSdkEffectsRef.current.add(effect.id);
        sdkPortRef.current?.postMessage({ effect, kind: "effect" } satisfies GameSyncInboundMessage);
      });
  }, [blockId, runtimeRunId, sdkRuntime, sync, sync?.sdkEffects]);

  useEffect(() => {
    if (!sync) {
      return;
    }
    const expectedRunId = sync.isAuthority ? channel : authorityRunId;
    if (!expectedRunId) return;
    if (handledInputsRef.current === null) {
      handledInputsRef.current = new Set(
        sync.inputs
          .filter((event) => !sync.isAuthority || event.runId !== expectedRunId)
          .map((event) => event.id),
      );
    }
    sync.inputs.forEach((event) => {
      if (event.blockId !== blockId || handledInputsRef.current?.has(event.id)) {
        return;
      }
      handledInputsRef.current?.add(event.id);
      if (event.runId !== expectedRunId) {
        return;
      }
      const actorId = event.actorId;
      const sequence = event.sequence;
      if (actorId && Number.isFinite(sequence)) {
        const latest = latestInputSequenceRef.current.get(actorId) ?? 0;
        if ((sequence ?? 0) <= latest) return;
        latestInputSequenceRef.current.set(actorId, sequence ?? 0);
      }
      iframeRef.current?.contentWindow?.postMessage({ channel, type: "applyInput", event }, "*");
    });
  }, [authorityRunId, blockId, channel, sync, sync?.inputs, sync?.isAuthority]);

  useEffect(() => {
    if (!sync || sync.isAuthority) {
      return;
    }
    if (
      appliedAuthorityRunId === authorityRunId
      && Date.now() - lastMirrorSnapshotAppliedAtRef.current < MIRROR_RECOVERY_SNAPSHOT_MS
    ) {
      return;
    }
    sendMirrorSnapshot(activeSnapshot);
  }, [activeSnapshot, appliedAuthorityRunId, authorityRunId, blockId, channel, sendMirrorSnapshot, sync?.isAuthority]);

  useEffect(() => {
    if (!sync || sync.isAuthority || !authorityAvailable) {
      return;
    }
    const patches = sync.patches ?? [];
    if (handledPatchesRef.current === null) {
      handledPatchesRef.current = new Set(
        patches
          .filter((patch) => patch.runId !== authorityRunId || patch.at <= (activeSnapshot?.updatedAt ?? 0))
          .map((patch) => patch.id),
      );
    }
    patches.forEach((patch) => {
      if (
        patch.blockId !== blockId
        || patch.runId !== authorityRunId
        || handledPatchesRef.current?.has(patch.id)
      ) {
        return;
      }
      handledPatchesRef.current?.add(patch.id);
      iframeRef.current?.contentWindow?.postMessage({ channel, patch, type: "applyPatch" }, "*");
    });
  }, [activeSnapshot?.updatedAt, authorityAvailable, authorityRunId, blockId, channel, sync, sync?.isAuthority, sync?.patches]);

  useEffect(() => {
    if (!sync || sync.isAuthority || predictiveMirror) {
      return;
    }
    if (handledEffectsRef.current === null) {
      handledEffectsRef.current = new Set(sync.effects.map((effect) => effect.id));
      return;
    }
    sync.effects.forEach((effect) => {
      if (effect.blockId !== blockId || handledEffectsRef.current?.has(effect.id)) {
        return;
      }
      handledEffectsRef.current?.add(effect.id);
      iframeRef.current?.contentWindow?.postMessage({ channel, type: "applyEffect", effect }, "*");
    });
  }, [blockId, channel, predictiveMirror, sync?.effects, sync?.isAuthority]);

  if (!html) {
    return (
      <div className="playsay-html-game-placeholder" role="status">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span>{t("materials.renderer.htmlGameLoading")}</span>
      </div>
    );
  }

  return (
    <div
      className="playsay-html-game"
      data-authority={sync?.isAuthority ? "true" : "false"}
      data-fill-available={fillAvailable ? "true" : "false"}
      data-paused={authorityAvailable ? "false" : "true"}
      data-runtime={sdkRuntime ? "sdk-v1" : predictiveMirror ? "predictive" : isMirror ? "authority-mirror" : "authority"}
    >
      <iframe
        allow="autoplay"
        ref={iframeRef}
        sandbox="allow-scripts allow-forms allow-pointer-lock"
        srcDoc={srcDoc}
        style={{ height: fillAvailable ? "100%" : height }}
        title={title}
      />
      {(isMirror || (sdkRuntime && !sync?.isAuthority)) && !authorityAvailable ? (
        <div className="playsay-html-game-waiting" role="status">
          <Gamepad2 className="h-5 w-5 text-primary" />
          <span>{t("materials.renderer.htmlGameWaiting")}</span>
        </div>
      ) : null}
    </div>
  );
}

export function createSandboxedGameDocument(
  html: string,
  channel: string,
  mirror: boolean,
  runId = channel,
  predictive = false,
): string {
  const sdkRuntime = classifyGameHtml(html) === "SDK_V1";
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">`;
  const sdkBridge = sdkRuntime
    ? `<script data-playsay-game-sdk-host>${sdkHostBridgeSource(channel)}</script>`
    : "";
  const bridge = `<script data-playsay-game-bridge>${gameBridgeSource(channel, mirror, runId, predictive)}</script>`;
  const headContent = `${csp}${sdkBridge}${bridge}`;
  const withHead = /<head\b[^>]*>/i.test(html)
    ? html.replace(/<head\b[^>]*>/i, (head) => `${head}${headContent}`)
    : html.replace(/<html\b[^>]*>/i, (root) => `${root}<head>${headContent}</head>`);
  if (sdkRuntime || !mirror || predictive) {
    return withHead;
  }
  return withHead.replace(/<script\b(?![^>]*data-playsay-game-bridge)([^>]*)>/gi, '<script type="application/playsay-disabled"$1>');
}

export function supportsPredictiveHtmlGame(html: string): boolean {
  return !/\b(?:EventSource|RTCPeerConnection|WebSocket|fetch|geolocation|getUserMedia)\b/.test(html);
}

function sdkHostBridgeSource(channel: string): string {
  return `(() => {
    const channel = ${JSON.stringify(channel)};
    let port = null;
    let readyTimer = 0;
    const outbound = [];
    const listeners = new Set();
    const transport = {
      close() {
        listeners.clear();
        port?.close();
        port = null;
      },
      send(message) {
        if (port) port.postMessage(message);
        else outbound.push(message);
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
    Object.defineProperty(window, '__PLAY_SAY_GAME_SYNC_TRANSPORT__', {
      configurable: false,
      value: transport
    });
    window.addEventListener('message', (event) => {
      if (
        event.source !== window.parent ||
        event.data?.channel !== channel ||
        event.data?.type !== 'playsay-sdk-connect' ||
        !event.ports?.[0]
      ) return;
      port?.close();
      port = event.ports[0];
      window.clearInterval(readyTimer);
      port.onmessage = (portEvent) => listeners.forEach((listener) => listener(portEvent.data));
      port.start();
      outbound.splice(0).forEach((message) => port.postMessage(message));
    });
    const announceReady = () => window.parent.postMessage({ channel, type: 'sdkReady' }, '*');
    announceReady();
    readyTimer = window.setInterval(announceReady, 500);
  })();`;
}

function gameBridgeSource(channel: string, mirror: boolean, runId: string, predictive: boolean): string {
  return `(() => {
    const channel = ${JSON.stringify(channel)};
    const mirror = ${mirror ? "true" : "false"};
    const predictive = ${predictive ? "true" : "false"};
    const runId = ${JSON.stringify(runId)};
    const nativePostMessage = window.parent.postMessage.bind(window.parent);
    const memory = new Map();
    const canvasSnapshotIntervalMs = 1500;
    const maxCanvasDataUrlLength = 150 * 1024;
    const maxPatchBytes = 64 * 1024;
    const maxPatchOperations = 80;
    const maxCanvasWidth = 960;
    const maxCanvasHeight = 540;
    const pointerMoveIntervalMs = 1000 / 30;
    let randomState = 2166136261;
    for (let index = 0; index < runId.length; index += 1) {
      randomState ^= runId.charCodeAt(index);
      randomState = Math.imul(randomState, 16777619);
    }
    const seededRandom = () => {
      randomState += 0x6D2B79F5;
      let value = randomState;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
    try { Object.defineProperty(Math, 'random', { configurable: false, value: seededRandom }); } catch (_) {}
    try {
      const nativeGetRandomValues = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = (array) => {
        if (!ArrayBuffer.isView(array)) return nativeGetRandomValues(array);
        const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
        for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(seededRandom() * 256);
        return array;
      };
      crypto.randomUUID = () => {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const value = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        return value.slice(0, 8) + '-' + value.slice(8, 12) + '-' + value.slice(12, 16) + '-' + value.slice(16, 20) + '-' + value.slice(20);
      };
    } catch (_) {}
    const storage = {
      get length() { return memory.size; },
      clear() { memory.clear(); },
      getItem(key) { const value = memory.get(String(key)); return value === undefined ? null : value; },
      key(index) { return [...memory.keys()][index] ?? null; },
      removeItem(key) { memory.delete(String(key)); },
      setItem(key, value) { memory.set(String(key), String(value)); }
    };
    try { Object.defineProperty(window, 'localStorage', { configurable: false, value: storage }); } catch (_) {}
    let nextNodeId = 1;
    let snapshotSequence = 0;
    let patchSequence = 0;
    let patchWindowUntil = 0;
    let patchFlushTimer = 0;
    let pendingPatchOperations = [];
    let snapshotDebounceTimer = 0;
    let snapshotDebounceAt = 0;
    let snapshotMaxTimer = 0;
    let snapshotMaxAt = 0;
    let lastSnapshotHtml = '';
    let lastSnapshotAt = 0;
    let lastCanvasSnapshotAt = 0;
    let lastCanvasSnapshot = {};
    let snapshotInFlight = false;
    let snapshotQueued = false;
    let readyRetryTimer = 0;
    let activePointerTargetId = null;
    let pendingPointerMove = null;
    let pointerMoveTimer = 0;
    let lastPointerMoveAt = 0;
    let replayingPointer = false;
    let applyingSnapshotRunId = '';
    let applyingSnapshotSequence = 0;
    let appliedSnapshotSequence = 0;
    let appliedPatchRunId = '';
    let appliedPatchSequence = 0;
    let dragTransfer = null;
    let pointerDragSourceId = null;
    let pointerDragStartX = 0;
    let pointerDragStartY = 0;
    let pointerDragLastX = 0;
    let pointerDragLastY = 0;
    let nativeDragStarted = false;
    const identify = (root = document) => {
      if (root.nodeType === 1 && !root.dataset.playsayNodeId) root.dataset.playsayNodeId = String(nextNodeId++);
      root.querySelectorAll?.('*').forEach((node) => {
        if (!node.dataset.playsayNodeId) node.dataset.playsayNodeId = String(nextNodeId++);
      });
    };
    const send = (value) => nativePostMessage({ channel, ...value }, '*');
    const reportRuntimeError = (reason) => {
      const message = reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : String(reason?.message ?? reason ?? 'Runtime error');
      send({ type: 'runtimeError', message: message.slice(0, 500) });
    };
    window.addEventListener('error', (event) => reportRuntimeError(event.error ?? event.message));
    window.addEventListener('unhandledrejection', (event) => reportRuntimeError(event.reason));
    const compactPatchOperations = (operations) => {
      const deduplicated = [];
      const latestByKey = new Map();
      operations.forEach((operation) => {
        const key = operation.type + ':' + operation.targetId + ':' + (operation.name ?? '');
        const previousIndex = latestByKey.get(key);
        if (previousIndex === undefined) {
          latestByKey.set(key, deduplicated.length);
          deduplicated.push(operation);
        } else {
          deduplicated[previousIndex] = operation;
        }
      });
      return deduplicated;
    };
    const patchAttributeNames = new Set(['aria-hidden', 'class', 'data-state', 'hidden', 'open', 'role', 'style']);
    const mutationOperations = (mutations) => {
      const operations = [];
      const push = (operation) => {
        if (operations.length < maxPatchOperations) operations.push(operation);
      };
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes') {
          if (mutation.attributeName === 'data-playsay-node-id') return;
          if (!patchAttributeNames.has(mutation.attributeName)) return;
          const target = mutation.target;
          const targetIdentifier = targetId(target);
          if (targetIdentifier === '__document__' || !mutation.attributeName) return;
          push({
            type: 'attribute',
            targetId: targetIdentifier,
            name: mutation.attributeName,
            value: target.getAttribute(mutation.attributeName)
          });
          return;
        }
        if (mutation.type === 'characterData') {
          const parent = mutation.target.parentElement;
          const targetIdentifier = parent ? targetId(parent) : '__document__';
          if (!parent || targetIdentifier === '__document__') return;
          push({ type: 'replace', targetId: targetIdentifier, html: parent.outerHTML });
          return;
        }
        mutation.removedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          const targetIdentifier = node.dataset.playsayNodeId;
          if (targetIdentifier) push({ type: 'remove', targetId: targetIdentifier });
        });
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE || !node.isConnected) return;
          identify(node);
          const parent = node.parentElement;
          const parentIdentifier = parent ? targetId(parent) : '__document__';
          const targetIdentifier = targetId(node);
          if (!parent || parentIdentifier === '__document__' || targetIdentifier === '__document__') return;
          let nextElement = node.nextElementSibling;
          while (nextElement && targetId(nextElement) === '__document__') nextElement = nextElement.nextElementSibling;
          const beforeId = nextElement ? targetId(nextElement) : undefined;
          push({
            type: 'upsert',
            targetId: targetIdentifier,
            parentId: parentIdentifier,
            ...(beforeId && beforeId !== '__document__' ? { beforeId } : {}),
            html: node.outerHTML
          });
        });
        const hasTextNodeChange = [...mutation.addedNodes, ...mutation.removedNodes]
          .some((node) => node.nodeType === Node.TEXT_NODE);
        if (hasTextNodeChange && mutation.target instanceof Element) {
          const targetIdentifier = targetId(mutation.target);
          if (targetIdentifier !== '__document__') {
            push({ type: 'replace', targetId: targetIdentifier, html: mutation.target.outerHTML });
          }
        }
      });
      return compactPatchOperations(operations);
    };
    const flushMutationPatch = () => {
      patchFlushTimer = 0;
      const operations = compactPatchOperations(pendingPatchOperations);
      pendingPatchOperations = [];
      if (!operations.length) return;
      const serialized = JSON.stringify(operations);
      if (serialized.length > maxPatchBytes || operations.length >= maxPatchOperations) {
        scheduleSnapshot(true);
        return;
      }
      send({ type: 'patch', operations, sequence: ++patchSequence });
    };
    const publishMutationPatch = (mutations) => {
      if (mirror || performance.now() > patchWindowUntil) return;
      const operations = mutationOperations(mutations);
      if (!operations.length) return;
      pendingPatchOperations.push(...operations);
      if (pendingPatchOperations.length >= maxPatchOperations) {
        window.clearTimeout(patchFlushTimer);
        patchFlushTimer = 0;
        pendingPatchOperations = [];
        scheduleSnapshot(true);
        return;
      }
      if (!patchFlushTimer) patchFlushTimer = window.setTimeout(flushMutationPatch, 50);
    };
    const formState = (node) => {
      const state = {};
      if ('value' in node) state.value = String(node.value ?? '');
      if ('checked' in node) state.checked = Boolean(node.checked);
      if ('selectedIndex' in node) state.selectedIndex = Number(node.selectedIndex);
      if ('selectionStart' in node) {
        state.selectionStart = node.selectionStart;
        state.selectionEnd = node.selectionEnd;
      }
      return state;
    };
    const serializeControls = () => Object.fromEntries(
      [...document.querySelectorAll('input, textarea, select')]
        .map((node) => [targetId(node), formState(node)])
    );
    const serializeScroll = () => {
      const entries = [];
      const documentScroller = document.scrollingElement;
      if (documentScroller) entries.push(['__document__', { left: documentScroller.scrollLeft, top: documentScroller.scrollTop }]);
      document.querySelectorAll('[data-playsay-node-id]').forEach((node) => {
        if (node.scrollLeft || node.scrollTop) entries.push([targetId(node), { left: node.scrollLeft, top: node.scrollTop }]);
      });
      return Object.fromEntries(entries);
    };
    const blobToDataUrl = (blob) => new Promise((resolve) => {
      if (!blob) {
        resolve('');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
    const encodeCanvas = async (source) => {
      try {
        let width = Math.max(1, source.width);
        let height = Math.max(1, source.height);
        const initialScale = Math.min(1, maxCanvasWidth / width, maxCanvasHeight / height);
        width = Math.max(1, Math.round(width * initialScale));
        height = Math.max(1, Math.round(height * initialScale));
        let dataUrl = '';
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const copy = document.createElement('canvas');
          copy.width = width;
          copy.height = height;
          copy.getContext('2d')?.drawImage(source, 0, 0, width, height);
          const quality = Math.max(.35, .75 - attempt * .08);
          dataUrl = typeof copy.toBlob === 'function'
            ? await new Promise((resolve) => {
                copy.toBlob(async (blob) => resolve(await blobToDataUrl(blob)), 'image/webp', quality);
              })
            : copy.toDataURL('image/webp', quality);
          if (!dataUrl || dataUrl.length <= maxCanvasDataUrlLength) break;
          width = Math.max(120, Math.round(width * .78));
          height = Math.max(68, Math.round(height * .78));
        }
        return dataUrl.length <= maxCanvasDataUrlLength ? dataUrl : '';
      } catch (_) {
        return '';
      }
    };
    const serializeCanvases = async () => {
      const entries = await Promise.all(
        [...document.querySelectorAll('canvas')].map(async (canvas) => [targetId(canvas), await encodeCanvas(canvas)])
      );
      return Object.fromEntries(entries.filter(([, dataUrl]) => Boolean(dataUrl)));
    };
    const canvasSnapshot = async () => {
      const now = Date.now();
      if (now - lastCanvasSnapshotAt < canvasSnapshotIntervalMs) return lastCanvasSnapshot;
      lastCanvasSnapshot = await serializeCanvases();
      lastCanvasSnapshotAt = Date.now();
      return lastCanvasSnapshot;
    };
    const flushSnapshot = async () => {
      window.clearTimeout(snapshotDebounceTimer);
      window.clearTimeout(snapshotMaxTimer);
      snapshotDebounceTimer = 0;
      snapshotDebounceAt = 0;
      snapshotMaxTimer = 0;
      snapshotMaxAt = 0;
      if (snapshotInFlight) {
        snapshotQueued = true;
        return;
      }
      snapshotInFlight = true;
      try {
        identify();
        const html = document.body?.outerHTML ?? '<body></body>';
        const controls = serializeControls();
        const scroll = serializeScroll();
        const canvases = await canvasSnapshot();
        const signature = JSON.stringify([html, controls, scroll, canvases]);
        if (signature !== lastSnapshotHtml) {
          lastSnapshotHtml = signature;
          lastSnapshotAt = Date.now();
          send({ type: 'snapshot', canvases, controls, html, scroll, sequence: ++snapshotSequence });
        }
      } finally {
        snapshotInFlight = false;
        if (snapshotQueued) {
          snapshotQueued = false;
          scheduleSnapshot(true);
        }
      }
    };
    const scheduleSnapshot = (meaningfulInput = false, continuousInput = false) => {
      if (mirror) return;
      const now = Date.now();
      const minimumInterval = meaningfulInput ? 750 : canvasSnapshotIntervalMs;
      const debounceDelay = meaningfulInput ? 120 : 500;
      const maxDelay = canvasSnapshotIntervalMs;
      const minimumIntervalRemaining = lastSnapshotAt ? Math.max(0, minimumInterval - (now - lastSnapshotAt)) : 0;
      const desiredDebounceDelay = Math.max(debounceDelay, minimumIntervalRemaining);
      const desiredDebounceAt = now + desiredDebounceDelay;
      if (!snapshotDebounceTimer || desiredDebounceAt < snapshotDebounceAt) {
        window.clearTimeout(snapshotDebounceTimer);
        snapshotDebounceAt = desiredDebounceAt;
        snapshotDebounceTimer = window.setTimeout(flushSnapshot, desiredDebounceDelay);
      }
      const desiredMaxDelay = Math.max(maxDelay, minimumIntervalRemaining);
      const desiredMaxAt = now + desiredMaxDelay;
      if (!snapshotMaxTimer || desiredMaxAt < snapshotMaxAt) {
        window.clearTimeout(snapshotMaxTimer);
        snapshotMaxAt = desiredMaxAt;
        snapshotMaxTimer = window.setTimeout(flushSnapshot, desiredMaxDelay);
      }
    };
    const targetId = (target) => {
      if (target === document || target === window || !target?.closest) return '__document__';
      const node = target.closest('[data-playsay-node-id]');
      return node?.dataset.playsayNodeId ?? '__document__';
    };
    const targetById = (id) => id === '__document__'
      ? document
      : document.querySelector('[data-playsay-node-id="' + CSS.escape(id) + '"]');
    const pointerState = (event, target) => {
      if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return {};
      const rect = target?.getBoundingClientRect?.();
      const width = Number(rect?.width) || 0;
      const height = Number(rect?.height) || 0;
      return {
        button: Number(event.button) || 0,
        buttons: Number(event.buttons) || 0,
        isPrimary: event.isPrimary === undefined ? undefined : Boolean(event.isPrimary),
        pointerId: Number.isFinite(event.pointerId) ? Number(event.pointerId) : undefined,
        pointerType: typeof event.pointerType === 'string' ? event.pointerType : undefined,
        relativeX: width ? Math.max(0, Math.min(1, (event.clientX - rect.left) / width)) : undefined,
        relativeY: height ? Math.max(0, Math.min(1, (event.clientY - rect.top) / height)) : undefined
      };
    };
    const inputEvent = (type, target, targetIdentifier, event) => ({
      type,
      targetId: targetIdentifier,
      key: event.key,
      code: event.code,
      altKey: Boolean(event.altKey),
      ctrlKey: Boolean(event.ctrlKey),
      metaKey: Boolean(event.metaKey),
      shiftKey: Boolean(event.shiftKey),
      ...pointerState(event, target),
      ...formState(target),
      data: event.data ?? null,
      inputType: event.inputType
    });
    const flushPointerMove = () => {
      if (pointerMoveTimer) {
        window.clearTimeout(pointerMoveTimer);
        pointerMoveTimer = 0;
      }
      const event = pendingPointerMove;
      pendingPointerMove = null;
      if (!event) return;
      lastPointerMoveAt = performance.now();
      send({ type: 'input', event });
    };
    const schedulePointerMove = (event) => {
      const target = targetById(activePointerTargetId) ?? event.target;
      const eventTargetId = targetId(target);
      pendingPointerMove = inputEvent('pointermove', target, eventTargetId, event);
      if (pointerMoveTimer) return;
      const delay = Math.max(0, pointerMoveIntervalMs - (performance.now() - lastPointerMoveAt));
      pointerMoveTimer = window.setTimeout(flushPointerMove, delay);
    };
    const semanticInputTypes = new Set(['beforeinput', 'input', 'change', 'focus', 'blur', 'compositionstart', 'compositionupdate', 'compositionend']);
    const immediateSnapshotInputTypes = new Set(['click', 'pointerup', 'pointercancel', 'drop', ...semanticInputTypes]);
    const inputTypes = ['click', 'pointerdown', 'pointerup', 'pointercancel', 'keydown', 'keyup', 'dragstart', 'dragover', 'drop', ...semanticInputTypes];
    inputTypes.forEach((type) => document.addEventListener(type, (event) => {
      if (event.__playsayReplay) return;
      if (mirror && (type === 'pointerup' || type === 'pointercancel')) flushPointerMove();
      const activePointerTarget = mirror && type.startsWith('pointer') && activePointerTargetId
        ? targetById(activePointerTargetId)
        : null;
      const resolvedTarget = activePointerTarget ?? event.target;
      const eventTargetId = targetId(resolvedTarget);
      if (!mirror && immediateSnapshotInputTypes.has(type)) {
        patchWindowUntil = performance.now() + 1000;
      }
      if (mirror) {
        const editableTarget = Boolean(event.target?.closest?.('input, textarea, select, [contenteditable="true"]'));
        const nativeDragEvent = type === 'pointerdown' || type === 'pointerup' || type === 'pointercancel' || type === 'dragstart' || type === 'dragover' || type === 'drop';
        const allowNativeEditing = semanticInputTypes.has(type) || (editableTarget && (type === 'keydown' || type === 'keyup'));
        if (!predictive && !allowNativeEditing && (type === 'dragover' || !nativeDragEvent)) event.preventDefault();
        if (!predictive && !nativeDragEvent) event.stopImmediatePropagation();
        if (type === 'pointerdown') {
          activePointerTargetId = eventTargetId;
          const draggable = event.target?.closest?.('[draggable="true"]');
          pointerDragSourceId = draggable ? targetId(draggable) : null;
          pointerDragStartX = Number(event.clientX) || 0;
          pointerDragStartY = Number(event.clientY) || 0;
          pointerDragLastX = pointerDragStartX;
          pointerDragLastY = pointerDragStartY;
          nativeDragStarted = false;
        } else if (type === 'dragstart') {
          pointerDragSourceId = eventTargetId;
          nativeDragStarted = true;
        } else if (type === 'drop') {
          pointerDragSourceId = null;
          nativeDragStarted = false;
        }
      }
      send({ type: 'input', event: inputEvent(type, resolvedTarget, eventTargetId, event) });
      if (mirror && (type === 'pointerup' || type === 'pointercancel')) activePointerTargetId = null;
      if (!mirror) scheduleSnapshot(immediateSnapshotInputTypes.has(type));
    }, true));
    document.addEventListener('pointermove', (event) => {
      if (!mirror) {
        if (event.buttons) scheduleSnapshot(false, true);
        return;
      }
      if (activePointerTargetId) {
        if (!predictive) event.preventDefault();
        schedulePointerMove(event);
      }
      if (pointerDragSourceId) {
        pointerDragLastX = Number(event.clientX) || pointerDragLastX;
        pointerDragLastY = Number(event.clientY) || pointerDragLastY;
      }
    }, true);
    const finishPointerDrag = (event) => {
      if (!mirror || predictive || !pointerDragSourceId) return;
      const eventX = Number(event.clientX) || 0;
      const eventY = Number(event.clientY) || 0;
      const eventDistance = Math.hypot(eventX - pointerDragStartX, eventY - pointerDragStartY);
      const trackedDistance = Math.hypot(pointerDragLastX - pointerDragStartX, pointerDragLastY - pointerDragStartY);
      const destinationX = trackedDistance > eventDistance ? pointerDragLastX : eventX;
      const destinationY = trackedDistance > eventDistance ? pointerDragLastY : eventY;
      const distance = Math.max(eventDistance, trackedDistance);
      if (!nativeDragStarted && distance < 8) {
        pointerDragSourceId = null;
        return;
      }
      const destination = document.elementFromPoint(destinationX, destinationY) ?? event.target;
      const destinationId = targetId(destination);
      send({ type: 'input', event: { type: 'dragstart', targetId: pointerDragSourceId } });
      send({ type: 'input', event: { type: 'dragover', targetId: destinationId } });
      send({ type: 'input', event: { type: 'drop', targetId: destinationId } });
      pointerDragSourceId = null;
      nativeDragStarted = false;
    };
    document.addEventListener('mouseup', finishPointerDrag, true);
    document.addEventListener('dragend', finishPointerDrag, true);
    const elementPrototype = window.Element?.prototype;
    const nativeSetPointerCapture = elementPrototype?.setPointerCapture;
    const nativeReleasePointerCapture = elementPrototype?.releasePointerCapture;
    if (nativeSetPointerCapture) {
      try {
        elementPrototype.setPointerCapture = function(pointerId) {
          if (replayingPointer) return;
          return nativeSetPointerCapture.call(this, pointerId);
        };
      } catch (_) {}
    }
    if (nativeReleasePointerCapture) {
      try {
        elementPrototype.releasePointerCapture = function(pointerId) {
          if (replayingPointer) return;
          return nativeReleasePointerCapture.call(this, pointerId);
        };
      } catch (_) {}
    }
    const replayCoordinates = (input, target) => {
      const rect = target?.getBoundingClientRect?.();
      const relativeX = Number(input.relativeX);
      const relativeY = Number(input.relativeY);
      return {
        clientX: rect && Number.isFinite(relativeX) ? rect.left + rect.width * relativeX : 0,
        clientY: rect && Number.isFinite(relativeY) ? rect.top + rect.height * relativeY : 0
      };
    };
    const makeEvent = (input, target) => {
      const common = { bubbles: true, cancelable: true, composed: true };
      const coordinates = replayCoordinates(input, target);
      let event;
      if (input.type === 'keydown' || input.type === 'keyup') {
        event = new KeyboardEvent(input.type, { ...common, key: input.key ?? '', code: input.code ?? '', altKey: input.altKey, ctrlKey: input.ctrlKey, metaKey: input.metaKey, shiftKey: input.shiftKey });
      } else if (input.type === 'beforeinput' || input.type === 'input') {
        event = new InputEvent(input.type, { ...common, data: input.data ?? null, inputType: input.inputType ?? '' });
      } else if (input.type.startsWith('composition')) {
        event = new CompositionEvent(input.type, { ...common, data: input.data ?? '' });
      } else if (input.type === 'change' || input.type === 'focus' || input.type === 'blur') {
        event = new Event(input.type, common);
      } else if (input.type.startsWith('pointer')) {
        event = new PointerEvent(input.type, {
          ...common,
          ...coordinates,
          button: Number(input.button) || 0,
          buttons: Number(input.buttons) || 0,
          isPrimary: input.isPrimary !== false,
          pointerId: Number(input.pointerId) || 1,
          pointerType: input.pointerType || 'mouse'
        });
      } else if (input.type === 'dragstart' || input.type === 'dragover' || input.type === 'drop') {
        if (input.type === 'dragstart' || !dragTransfer) dragTransfer = new DataTransfer();
        event = new DragEvent(input.type, { ...common, dataTransfer: dragTransfer });
      } else {
        event = new MouseEvent(input.type, { ...common, ...coordinates, button: Number(input.button) || 0, buttons: Number(input.buttons) || 0 });
      }
      Object.defineProperty(event, '__playsayReplay', { value: true });
      return event;
    };
    const applyFormState = (target, state) => {
      if (!target || target === document) return;
      if ('value' in target && state.value !== undefined) target.value = state.value;
      if ('checked' in target && state.checked !== undefined) target.checked = Boolean(state.checked);
      if ('selectedIndex' in target && state.selectedIndex !== undefined) target.selectedIndex = Number(state.selectedIndex);
      if (
        typeof target.setSelectionRange === 'function'
        && state.selectionStart !== undefined
        && state.selectionStart !== null
      ) {
        try { target.setSelectionRange(state.selectionStart, state.selectionEnd ?? state.selectionStart); } catch (_) {}
      }
    };
    const applySnapshotState = async (snapshot, runId, sequence) => {
      Object.entries(snapshot.controls ?? {}).forEach(([id, state]) => {
        const target = document.querySelector('[data-playsay-node-id="' + CSS.escape(id) + '"]');
        applyFormState(target, state);
      });
      Object.entries(snapshot.scroll ?? {}).forEach(([id, state]) => {
        const target = id === '__document__'
          ? document.scrollingElement
          : document.querySelector('[data-playsay-node-id="' + CSS.escape(id) + '"]');
        if (target) {
          target.scrollLeft = Number(state.left) || 0;
          target.scrollTop = Number(state.top) || 0;
        }
      });
      await Promise.all(Object.entries(snapshot.canvases ?? {}).map(([id, dataUrl]) => new Promise((resolve) => {
        const canvas = document.querySelector('[data-playsay-node-id="' + CSS.escape(id) + '"]');
        if (!(canvas instanceof HTMLCanvasElement) || !dataUrl) {
          resolve(undefined);
          return;
        }
        const image = new Image();
        image.onload = () => {
          if (applyingSnapshotRunId === runId && applyingSnapshotSequence === sequence) {
            const context = canvas.getContext('2d');
            context?.clearRect(0, 0, canvas.width, canvas.height);
            context?.drawImage(image, 0, 0, canvas.width, canvas.height);
          }
          resolve(undefined);
        };
        image.onerror = () => resolve(undefined);
        image.src = dataUrl;
      })));
    };
    const playEffect = (effect) => {
      if (effect.kind === 'speech' && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(String(effect.payload.text ?? ''));
        utterance.lang = String(effect.payload.lang ?? 'en-US');
        utterance.rate = Number(effect.payload.rate ?? 1);
        utterance.pitch = Number(effect.payload.pitch ?? 1);
        window.speechSynthesis.speak(utterance);
      } else if (effect.kind === 'audio') {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        const context = new AudioContextClass();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = String(effect.payload.oscillatorType ?? 'sine');
        oscillator.frequency.setValueAtTime(Number(effect.payload.from ?? 220), context.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, Number(effect.payload.to ?? effect.payload.from ?? 220)), context.currentTime + Number(effect.payload.duration ?? .1));
        gain.gain.setValueAtTime(Number(effect.payload.volume ?? .05), context.currentTime);
        gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + Number(effect.payload.duration ?? .1));
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + Number(effect.payload.duration ?? .1));
        oscillator.onended = () => context.close?.();
      }
    };
    const patchAttributes = (current, next) => {
      [...current.attributes].forEach((attribute) => {
        if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
      });
      [...next.attributes].forEach((attribute) => {
        if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
      });
    };
    const patchNode = (current, next) => {
      if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) {
        current.replaceWith(next.cloneNode(true));
        return;
      }
      if (current.nodeType === Node.TEXT_NODE) {
        if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
        return;
      }
      if (current.nodeType !== Node.ELEMENT_NODE) return;
      patchAttributes(current, next);
      const nextChildren = [...next.childNodes];
      let cursor = current.firstChild;
      nextChildren.forEach((nextChild) => {
        const nodeId = nextChild.nodeType === Node.ELEMENT_NODE ? nextChild.dataset.playsayNodeId : '';
        let match = null;
        if (nodeId) {
          match = [...current.childNodes].find((child) => child.nodeType === Node.ELEMENT_NODE && child.dataset.playsayNodeId === nodeId) ?? null;
        } else if (cursor && cursor.nodeType === nextChild.nodeType && cursor.nodeName === nextChild.nodeName) {
          match = cursor;
        }
        if (!match) {
          match = nextChild.cloneNode(true);
          current.insertBefore(match, cursor);
        } else if (match !== cursor) {
          current.insertBefore(match, cursor);
        }
        patchNode(match, nextChild);
        cursor = match.nextSibling;
      });
      while (cursor) {
        const nextCursor = cursor.nextSibling;
        cursor.remove();
        cursor = nextCursor;
      }
    };
    const patchElementFromHtml = (html, body = false) => {
      if (body) {
        const parsed = new DOMParser().parseFromString(String(html), 'text/html');
        parsed.querySelectorAll('script').forEach((script) => script.type = 'application/playsay-disabled');
        return parsed.body;
      }
      const template = document.createElement('template');
      template.innerHTML = String(html).trim();
      template.content.querySelectorAll('script').forEach((script) => script.type = 'application/playsay-disabled');
      return template.content.firstElementChild;
    };
    const rejectPatch = (runId, sequence) => {
      send({ type: 'patchRejected', runId, sequence });
    };
    const applyPatchOperations = (patch) => {
      const runId = typeof patch.runId === 'string' ? patch.runId : '';
      const sequence = Number(patch.sequence) || 0;
      if (!runId || sequence <= 0) return;
      if (runId !== appliedPatchRunId) {
        appliedPatchRunId = runId;
        appliedPatchSequence = 0;
      }
      if (sequence <= appliedPatchSequence) return;
      if (appliedPatchSequence > 0 && sequence !== appliedPatchSequence + 1) {
        rejectPatch(runId, sequence);
        return;
      }
      try {
        for (const operation of patch.operations ?? []) {
          if (operation.type === 'remove') {
            targetById(operation.targetId)?.remove?.();
            continue;
          }
          if (operation.type === 'attribute') {
            const target = targetById(operation.targetId);
            if (!(target instanceof Element)) throw new Error('missing patch attribute target');
            if (operation.value === null) target.removeAttribute(operation.name);
            else target.setAttribute(operation.name, operation.value);
            continue;
          }
          if (operation.type === 'replace') {
            const current = targetById(operation.targetId);
            if (!(current instanceof Element)) throw new Error('missing patch replace target');
            const next = patchElementFromHtml(operation.html, current === document.body);
            if (!(next instanceof Element)) throw new Error('invalid patch replacement');
            if (current.outerHTML !== next.outerHTML) patchNode(current, next);
            continue;
          }
          if (operation.type === 'upsert') {
            const parent = targetById(operation.parentId);
            if (!(parent instanceof Element)) throw new Error('missing patch parent');
            const next = patchElementFromHtml(operation.html);
            if (!(next instanceof Element)) throw new Error('invalid patch insertion');
            const current = targetById(operation.targetId);
            const before = operation.beforeId ? targetById(operation.beforeId) : null;
            if (current instanceof Element) {
              if (current.outerHTML !== next.outerHTML) patchNode(current, next);
              const positioned = targetById(operation.targetId);
              if (!(positioned instanceof Element)) throw new Error('missing patched insertion target');
              parent.insertBefore(positioned, before instanceof Node ? before : null);
            } else {
              parent.insertBefore(next, before instanceof Node ? before : null);
            }
          }
        }
        identify();
        appliedPatchSequence = sequence;
      } catch (_) {
        rejectPatch(runId, sequence);
      }
    };
    window.addEventListener('message', async (messageEvent) => {
      const message = messageEvent.data;
      if (!message || message.channel !== channel) return;
      if (message.type === 'applySnapshot' && mirror) {
        const runId = typeof message.snapshot.runId === 'string' ? message.snapshot.runId : '';
        const sequence = Number(message.snapshot.sequence) || 0;
        if (runId !== applyingSnapshotRunId) {
          applyingSnapshotRunId = runId;
          applyingSnapshotSequence = 0;
          appliedSnapshotSequence = 0;
        }
        if (sequence <= appliedSnapshotSequence) {
          send({ type: 'snapshotApplied', runId, sequence });
          return;
        }
        if (sequence <= applyingSnapshotSequence) return;
        applyingSnapshotSequence = sequence;
        const parsed = new DOMParser().parseFromString(message.snapshot.html, 'text/html');
        parsed.querySelectorAll('script').forEach((script) => script.type = 'application/playsay-disabled');
        if (document.body && parsed.body) patchNode(document.body, parsed.body);
        identify();
        await applySnapshotState(message.snapshot, runId, sequence);
        if (applyingSnapshotRunId === runId && applyingSnapshotSequence === sequence) {
          appliedSnapshotSequence = sequence;
          appliedPatchRunId = runId;
          appliedPatchSequence = 0;
          window.clearInterval(readyRetryTimer);
          readyRetryTimer = 0;
          send({ type: 'snapshotApplied', runId, sequence });
        }
      } else if (message.type === 'applyPatch' && mirror) {
        applyPatchOperations(message.patch);
      } else if (message.type === 'applyInput' && (!mirror || predictive)) {
        const input = message.event;
        const target = targetById(input.targetId);
        if (!mirror && immediateSnapshotInputTypes.has(input.type)) {
          patchWindowUntil = performance.now() + 1000;
        }
        applyFormState(target, input);
        if (input.type === 'focus') target?.focus?.();
        if (input.type === 'blur') target?.blur?.();
        const pointerInput = input.type.startsWith('pointer');
        try {
          replayingPointer = pointerInput;
          target?.dispatchEvent(makeEvent(input, target));
        } finally {
          replayingPointer = false;
        }
        scheduleSnapshot(immediateSnapshotInputTypes.has(input.type), input.type === 'pointermove');
      } else if (message.type === 'applyEffect' && mirror) {
        playEffect(message.effect);
      }
    });
    if (!mirror) {
      const patchSpeech = () => {
        if (!window.speechSynthesis) return;
        const nativeSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
        window.speechSynthesis.speak = (utterance) => {
          send({ type: 'effect', effect: { kind: 'speech', payload: { text: utterance.text, lang: utterance.lang, rate: utterance.rate, pitch: utterance.pitch } } });
          return nativeSpeak(utterance);
        };
      };
      const patchAudio = () => {
        const prototype = window.BaseAudioContext?.prototype;
        if (!prototype || prototype.__playsayPatched) return;
        Object.defineProperty(prototype, '__playsayPatched', { value: true });
        const nativeCreateOscillator = prototype.createOscillator;
        prototype.createOscillator = function() {
          const oscillator = nativeCreateOscillator.call(this);
          const meta = { from: oscillator.frequency.value, to: oscillator.frequency.value, duration: .1, volume: .05 };
          const nativeSet = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
          const nativeRamp = oscillator.frequency.exponentialRampToValueAtTime.bind(oscillator.frequency);
          oscillator.frequency.setValueAtTime = (value, time) => { meta.from = Number(value); meta.to = Number(value); return nativeSet(value, time); };
          oscillator.frequency.exponentialRampToValueAtTime = (value, time) => { meta.to = Number(value); meta.duration = Math.max(.01, Number(time) - this.currentTime); return nativeRamp(value, time); };
          const nativeConnect = oscillator.connect.bind(oscillator);
          oscillator.connect = (node, ...args) => {
            if (node?.gain) {
              const gainParam = node.gain;
              const gainSet = gainParam.setValueAtTime.bind(gainParam);
              gainParam.setValueAtTime = (value, time) => { meta.volume = Number(value); return gainSet(value, time); };
            }
            return nativeConnect(node, ...args);
          };
          const nativeStop = oscillator.stop.bind(oscillator);
          oscillator.stop = (when) => {
            if (Number.isFinite(when)) meta.duration = Math.max(.01, Number(when) - this.currentTime);
            send({ type: 'effect', effect: { kind: 'audio', payload: { oscillatorType: oscillator.type, ...meta } } });
            return nativeStop(when);
          };
          return oscillator;
        };
      };
      patchSpeech();
      patchAudio();
    }
    const start = () => {
      identify();
      if (mirror) {
        if (predictive) new MutationObserver(() => identify()).observe(document.documentElement, { childList: true, subtree: true });
        const announceReady = () => send({ type: 'ready', mirror: true });
        announceReady();
        readyRetryTimer = window.setInterval(announceReady, 500);
      } else {
        new MutationObserver((mutations) => {
          publishMutationPatch(mutations);
          scheduleSnapshot(false, true);
        }).observe(document.documentElement, { attributes: true, characterData: true, childList: true, subtree: true });
        scheduleSnapshot();
      }
      send({ type: 'runtimeReady' });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  })();`;
}
