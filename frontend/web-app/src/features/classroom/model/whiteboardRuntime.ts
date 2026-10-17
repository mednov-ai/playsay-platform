import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as sync from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import { createCollaborationDocumentToken } from "../../../shared/api/collaboration";
import type { LessonWhiteboard, WhiteboardRegion } from "../../../shared/api/whiteboard";
import type { AnnotationElement } from "./annotation";

export type WhiteboardElement = AnnotationElement & { ownerSubject: string };
export type WhiteboardRuntimeState = {
  elements: WhiteboardElement[]; camera: WhiteboardRegion | null;
  status: "connecting" | "connected" | "unsaved" | "saved" | "error" | "unsupported";
  canUndo: boolean; canRedo: boolean; limited: boolean;
  cursors: Array<{ id: number; x: number; y: number; name: string; color: string }>;
};
const encodeControl = (type: number, value: unknown) => {
  const e = encoding.createEncoder(); encoding.writeVarUint(e, type); encoding.writeVarString(e, JSON.stringify(value)); return encoding.toUint8Array(e);
};
function fromBase64(value: string): Uint8Array { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }

/** The runtime survives surface switches; a socket is attached only while this board is active. */
export class WhiteboardRuntime {
  readonly doc = new Y.Doc();
  readonly annotations = this.doc.getMap<Y.Map<unknown>>("annotations");
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  private readonly origin = {};
  private readonly undoManager = new Y.UndoManager(this.annotations, { trackedOrigins: new Set([this.origin]), captureTimeout: 500 });
  private listeners = new Set<() => void>();
  private socket: WebSocket | null = null;
  private generation = 0;
  private active = false;
  private hello = false;
  private synchronized = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  private cursorTimer: ReturnType<typeof setTimeout> | null = null;
  private cursorPosition: { x: number; y: number } | null = null;
  private pending = false;
  private disposed = false;
  private capacityFailed = false;
  private limited = false;
  private recoveryEnabled = false;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private recoveryNonce: string | null = null;
  private lastProbe = 0;
  private readonly wake = () => { if (this.active && document.visibilityState === "visible") { if (this.socket?.readyState === WebSocket.OPEN && this.recoveryEnabled) this.probe(); else this.retry(); } };
  private persisted = new Map<number, number>();
  private persistedDeletes = "AAA=";
  private failures = 0;
  private state: WhiteboardRuntimeState = { elements: [], camera: null, status: "connecting", canUndo: false, canRedo: false, limited: false, cursors: [] };

  constructor(readonly board: LessonWhiteboard, readonly actor: string, name: string) {
    const snapshot = board.document.snapshot;
    try {
      if (snapshot && (snapshot.encoding !== "yjs-update-v1" || snapshot.coordinateSpace !== "whiteboard-world" || snapshot.contentEpoch !== board.contentEpoch)) throw new Error("invalid board snapshot");
      if (typeof snapshot?.yjsUpdateBase64 === "string") Y.applyUpdate(this.doc, fromBase64(snapshot.yjsUpdateBase64));
      if (typeof snapshot?.stateVectorBase64 === "string") this.persisted = Y.decodeStateVector(fromBase64(snapshot.stateVectorBase64));
      if (typeof snapshot?.deleteSetBase64 === "string") this.persistedDeletes = snapshot.deleteSetBase64;
    } catch { this.capacityFailed = true; this.state.status = "error"; }
    this.awareness.setLocalState({ user: { name, color: "#9a5700" }, cursor: null });
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === this.origin || origin === this.undoManager) this.pending = true;
      if (origin !== this.socket && this.socket?.readyState === WebSocket.OPEN) {
        const e = encoding.createEncoder(); encoding.writeVarUint(e, 0); sync.writeUpdate(e, update); this.socket.send(encoding.toUint8Array(e));
      }
      this.refresh();
    });
    this.doc.getMap("whiteboardCamera").observe(() => this.refresh());
    this.awareness.on("change", () => this.refresh());
    this.awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin === this.socket || this.socket?.readyState !== WebSocket.OPEN) return;
      const e = encoding.createEncoder(); encoding.writeVarUint(e, 1); encoding.writeVarUint8Array(e, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [...added, ...updated, ...removed])); this.socket.send(encoding.toUint8Array(e));
    });
    for (const event of ["stack-item-added", "stack-item-popped", "stack-cleared"] as const) this.undoManager.on(event, () => this.refresh());
    this.refresh();
  }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  private refresh(status?: WhiteboardRuntimeState["status"]) {
    const elements = [...this.annotations.values()].map(value => value.toJSON() as WhiteboardElement).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    const cursors = [...this.awareness.getStates()].flatMap(([id, value]) => id !== this.doc.clientID && value.cursor && Number.isFinite(value.cursor.x) && Number.isFinite(value.cursor.y)
      ? [{ id, x: value.cursor.x, y: value.cursor.y, name: String(value.user?.name ?? ""), color: /^#[0-9a-f]{6}$/i.test(String(value.user?.color)) ? value.user.color : "#9a5700" }] : []);
    const covered = isWhiteboardStatePersisted(this.doc, this.persisted, this.persistedDeletes);
    if (covered) this.pending = false;
    this.state = { elements, camera: this.doc.getMap("whiteboardCamera").get("state") as WhiteboardRegion ?? null,
      status: status ?? ((this.state.status === "error" || this.state.status === "unsupported") ? this.state.status : !this.hello || !this.synchronized ? "connecting" : this.pending ? "unsaved" : covered ? "saved" : "connected"),
      limited: this.limited, canUndo: this.undoManager.undoStack.length > 0, canRedo: this.undoManager.redoStack.length > 0, cursors };
    this.listeners.forEach(listener => listener());
  }

  get reclaimable() { return !this.active && this.listeners.size === 0 && !this.pending; }
  failCapacity() { this.capacityFailed = true; this.limited = true; this.refresh("error"); }
  dispose() { this.pause(); this.disposed = true; this.undoManager.destroy(); this.awareness.destroy(); this.doc.destroy(); this.listeners.clear(); }
  activate() {
    if (this.active || this.disposed || this.capacityFailed) return;
    this.active = true; this.failures = 0;
    window.addEventListener("online", this.wake); document.addEventListener("visibilitychange", this.wake);
    void this.connect();
  }
  pause() {
    this.active = false; this.generation += 1;
    window.removeEventListener("online", this.wake); document.removeEventListener("visibilitychange", this.wake);
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null; this.recoveryNonce = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.probeTimer) clearTimeout(this.probeTimer);
    this.socket?.close(1000); this.socket = null;
    if (this.cursorTimer) clearTimeout(this.cursorTimer); this.cursorTimer = null; this.awareness.setLocalStateField("cursor", null);
  }
  retry = () => { this.pause(); this.state = { ...this.state, status: "connecting" }; this.activate(); };
  private async connect() {
    const generation = ++this.generation;
    this.hello = false; this.synchronized = false; this.recoveryEnabled = false; this.refresh("connecting");
    try {
      const token = await Promise.race([createCollaborationDocumentToken(this.board.lessonId, this.board.document.id), new Promise<never>((_, reject) => { this.probeTimer = setTimeout(() => reject(new Error("timeout")), 5000); })]);
      if (this.probeTimer) clearTimeout(this.probeTimer);
      if (!this.active || generation !== this.generation) return;
      if (token.documentId !== this.board.document.id || token.yjsDocumentId !== this.board.document.yjsDocumentId) throw new Error("wrong board context");
      const url = new URL(token.websocketUrl, `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`);
      url.searchParams.set("room", token.yjsDocumentId); url.searchParams.set("token", token.token);
      const socket = new WebSocket(url); this.socket = socket; socket.binaryType = "arraybuffer";
      this.probeTimer = setTimeout(() => { if (generation === this.generation && (!this.hello || !this.synchronized)) { this.refresh(this.hello ? "error" : "unsupported"); socket.close(1003); } }, 10000);
      socket.onopen = () => {
        if (!this.active || generation !== this.generation) { socket.close(); return; }
        // The departed connection's server tombstone advances its awareness clock.
        // Reclaim this runtime's ID with a strictly newer clock on every attach.
        const localState = this.awareness.getLocalState();
        this.awareness.setLocalState(null); this.awareness.setLocalState(localState);
        const e = encoding.createEncoder(); encoding.writeVarUint(e, 0); sync.writeSyncStep1(e, this.doc); socket.send(encoding.toUint8Array(e));
        const a = encoding.createEncoder(); encoding.writeVarUint(a, 1); encoding.writeVarUint8Array(a, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID])); socket.send(encoding.toUint8Array(a));
      };
      socket.onmessage = event => {
        if (generation !== this.generation || socket !== this.socket) return;
        try {
          const d = decoding.createDecoder(new Uint8Array(event.data as ArrayBuffer)); const type = decoding.readVarUint(d);
          if (type === 0) {
            const e = encoding.createEncoder(); encoding.writeVarUint(e, 0);
            const syncType = sync.readSyncMessage(d, e, this.doc, socket);
            if (encoding.length(e) > 1) socket.send(encoding.toUint8Array(e));
            if (syncType === sync.messageYjsSyncStep2) this.synchronized = true;
          } else if (type === 1) awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(d), socket);
          else if (type === 4) {
            const value = JSON.parse(decoding.readVarString(d));
            if (value.type === "hello" && value.version === 1 && value.liveness === true) this.recoveryEnabled = true;
            else if (value.type === "ack" && value.nonce === this.recoveryNonce) { this.recoveryNonce = null; if (this.recoveryTimer) clearTimeout(this.recoveryTimer); this.scheduleProbe(); }
          }
          else if (type === 5 || type === 6) {
            const value = JSON.parse(decoding.readVarString(d));
            if (type === 5 && value.type === "hello" && value.version === 1 && value.whiteboard === true) this.hello = true;
            if (type === 6 && value.type === "persisted" && value.contentEpoch === this.board.contentEpoch && typeof value.stateVector === "string" && typeof value.deleteSet === "string") {
              this.persisted = Y.decodeStateVector(fromBase64(value.stateVector)); this.persistedDeletes = value.deleteSet;
            }
          }
          if (this.hello && this.synchronized) { this.failures = 0; if (this.probeTimer) clearTimeout(this.probeTimer); if (this.recoveryEnabled && !this.recoveryTimer) this.scheduleProbe(); }
          this.refresh();
        } catch { this.refresh("error"); socket.close(1003); }
      };
      socket.onclose = event => {
        if (!this.active || generation !== this.generation) return;
        this.socket = null; if (this.recoveryTimer) clearTimeout(this.recoveryTimer); this.recoveryTimer = null; this.recoveryNonce = null; this.refresh(this.state.status === "unsupported" ? "unsupported" : "error");
        if (![1003, 1008, 4404, 4409].includes(event.code) && this.failures++ < 8) this.retryTimer = setTimeout(() => void this.connect(), Math.min(30000, 500 * 2 ** this.failures));
        if (event.code === 4404) window.dispatchEvent(new CustomEvent("honey-whiteboard-changed", { detail: this.board.lessonId }));
      };
      socket.onerror = () => this.refresh("error");
    } catch { if (generation === this.generation) this.refresh("error"); }
  }

  private scheduleProbe() { this.recoveryTimer = setTimeout(() => { this.recoveryTimer = null; this.probe(); }, 20000); }
  private probe() {
    if (!this.active || this.recoveryNonce || this.socket?.readyState !== WebSocket.OPEN || Date.now() - this.lastProbe < 5000) return;
    this.lastProbe = Date.now();
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryNonce = Array.from(crypto.getRandomValues(new Uint8Array(8)), value => value.toString(16).padStart(2, "0")).join("");
    this.socket.send(encodeControl(4, { type: "probe", version: 1, nonce: this.recoveryNonce }));
    this.recoveryTimer = setTimeout(() => { this.recoveryTimer = null; this.retry(); }, 5000);
  }

  patch(id: string, patch: Record<string, unknown>) {
    // Reserve headroom below the server's 1 MB JSON snapshot limit. Rejection leaves the prior drawing editable.
    const outOfBounds = (value: unknown, key = ""): boolean => {
      if ((key === "x" || key === "y") && typeof value === "number") return !Number.isFinite(value) || Math.abs(value) > 100000;
      if (Array.isArray(value)) return value.some(item => outOfBounds(item, key));
      if (value && typeof value === "object") return Object.entries(value).some(([field, item]) => outOfBounds(item, field));
      return false;
    };
    if ((!this.annotations.has(id) && this.annotations.size >= 10000) || Y.encodeStateAsUpdate(this.doc).byteLength > 650000 || outOfBounds(patch) || (typeof patch.text === "string" && patch.text.length > 20000)) {
      this.limited = true; this.refresh(); return;
    }
    this.limited = false;
    this.doc.transact(() => {
      let element = this.annotations.get(id);
      if (!element) { element = new Y.Map(); this.annotations.set(id, element); element.set("id", id); element.set("ownerSubject", this.actor); }
      for (const [key, value] of Object.entries(patch)) {
        if (key === "points" && Array.isArray(value)) {
          let points = element.get(key);
          if (!(points instanceof Y.Array)) { points = new Y.Array(); element.set(key, points); }
          const array = points as Y.Array<unknown>, previous = array.toArray();
          if (value.length >= previous.length && previous.every((item, index) => JSON.stringify(item) === JSON.stringify(value[index]))) array.push(value.slice(previous.length));
          else { array.delete(0, array.length); array.push(value); }
        }
        else if (key === "text" && typeof value === "string") writeText(element, value);
        else if (JSON.stringify(element.get(key)) !== JSON.stringify(value)) element.set(key, value);
      }
    }, this.origin);
  }
  remove(id: string) { this.limited = false; this.doc.transact(() => this.annotations.delete(id), this.origin); }
  undo = () => { this.limited = false; return this.undoManager.undo(); };
  redo = () => this.undoManager.redo();
  stopCapturing = () => this.undoManager.stopCapturing();
  cursor(value: { x: number; y: number } | null) {
    this.cursorPosition = value;
    if (!value) { if (this.cursorTimer) clearTimeout(this.cursorTimer); this.cursorTimer = null; this.awareness.setLocalStateField("cursor", null); }
    else if (!this.cursorTimer) this.cursorTimer = setTimeout(() => { this.cursorTimer = null; this.awareness.setLocalStateField("cursor", this.cursorPosition); }, 40);
  }
  publishCamera(region: WhiteboardRegion) {
    if (this.board.canManage && this.socket?.readyState === WebSocket.OPEN) this.socket.send(encodeControl(5, { type: "camera", version: 1, sourceClientId: this.doc.clientID, region }));
  }
}

function writeText(element: Y.Map<unknown>, next: string) {
  let value = element.get("text");
  if (!(value instanceof Y.Text)) { value = new Y.Text(); element.set("text", value); }
  const text = value as Y.Text, previous = text.toString();
  let start = 0, end = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  while (end < previous.length - start && end < next.length - start && previous[previous.length - 1 - end] === next[next.length - 1 - end]) end++;
  const removed = previous.length - start - end;
  if (removed) text.delete(start, removed);
  const inserted = next.slice(start, next.length - end);
  if (inserted) text.insert(start, inserted);
}

/** State vectors do not advance on deletion; acknowledge its canonical delete set as well. */
export function isWhiteboardStatePersisted(doc: Y.Doc, vector: Map<number, number>, deleted: string): boolean {
  const current = Y.encodeStateVector(doc);
  const covered = [...Y.decodeStateVector(current)].every(([id, clock]) => (vector.get(id) ?? 0) >= clock);
  const bytes = Y.encodeStateAsUpdate(doc, current), parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32768) parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  const deletes = btoa(parts.join(""));
  return covered && deletes === deleted;
}
