type Anchor = { serverMs: number; receivedAt: number };
let anchor: Anchor | null = null;
let synchronized = false;
const listeners = new Set<() => void>();

export function observeServerTime(data: unknown): void {
  const sample = Array.isArray(data) ? data[0] : data;
  if (!sample || typeof sample !== "object" || !("serverNow" in sample) || typeof sample.serverNow !== "string") return;
  const serverMs = Date.parse(sample.serverNow);
  if (!Number.isFinite(serverMs) || (anchor && serverMs < anchor.serverMs)) return;
  anchor = { serverMs, receivedAt: performance.now() };
  synchronized = true;
  listeners.forEach((listener) => listener());
}

export function serverNowMs(): number {
  return anchor ? anchor.serverMs + Math.max(0, performance.now() - anchor.receivedAt) : Number.NaN;
}

export function serverClockSynchronized(): boolean { return synchronized; }
export function invalidateServerClock(): void { synchronized = false; listeners.forEach((listener) => listener()); }
export function subscribeServerClock(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function resetServerClock(): void { anchor = null; synchronized = false; }
