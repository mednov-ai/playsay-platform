export type ConnectionChannel = "api" | "auth" | "signaling" | "collaboration" | "publisher" | "subscriber" | "policy";
export type RouteObservation = { endpoint: string | null; state: "connected" | "unavailable"; at: number; transport?: string; relayMatched?: boolean | null; received?: boolean | null; policy?: "relay" | "baseline" | "invalid" };
const observations = new Map<ConnectionChannel, RouteObservation>();
const publicHosts = new Set(["online.honey.school", "online.honeyschool.ru", "dev.online.honey.school", "dev.online.honeyschool.ru", "ops.honey.school", "dev.ops.honey.school"]);

// Only declared public endpoint names survive this boundary; never URLs or ICE addresses.
export function publicEndpoint(value: string): string | null {
  try {
    const url = new URL(value, globalThis.location?.origin);
    return ["https:", "wss:"].includes(url.protocol) && publicHosts.has(url.hostname) && !url.port ? url.hostname : null;
  } catch { return null; }
}
export function observeConnection(channel: ConnectionChannel, endpoint: string, connected: boolean, media?: { transport: string; relayMatched: boolean | null; received?: boolean | null }) {
  observations.set(channel, {
    endpoint: publicEndpoint(endpoint), state: connected ? "connected" : "unavailable", at: Date.now(),
    ...(media ? { transport: ["direct", "turn-udp", "turn-tcp", "turn-tls"].includes(media.transport) ? media.transport : "unknown", relayMatched: media.relayMatched, received: media.received ?? null } : {}),
  });
}
export function connectionObservations(): ReadonlyMap<ConnectionChannel, RouteObservation> { return new Map(observations); }
export function observeHttpResponse(response: Response) {
  try {
    const url = new URL(response.url);
    if (!publicEndpoint(url.href)) return;
    const channel = url.pathname.startsWith("/keycloak/") ? "auth" : url.pathname.startsWith("/api/") ? "api" : null;
    if (channel) observeConnection(channel, url.origin, response.status < 500);
  } catch { /* Synthetic responses need not carry a URL. */ }
}
export function diagnosticsShortcut(event: KeyboardEvent, mac: boolean): boolean {
  const target = event.target;
  return !event.defaultPrevented && !event.repeat && !event.isComposing && event.code === "KeyD"
    && event.altKey && event.shiftKey && (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)
    && !(target instanceof Element && target.closest("input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=textbox]"));
}

export function observeSessionPolicy(endpoint: string, policy: "relay" | "baseline" | "invalid") {
  observations.set("policy", { endpoint: publicEndpoint(endpoint), policy, state: policy === "invalid" ? "unavailable" : "connected", at: Date.now() });
}
