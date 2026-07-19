const pendingChatTargetKey = "playsay.chat.pendingTarget";
const chatTargetPattern = /^(open|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export function rememberChatTargetFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const value = normalizedTarget(new URL(window.location.href).searchParams.get("chat"));
  if (value) window.sessionStorage.setItem(pendingChatTargetKey, value);
  return value;
}

export function readPendingChatTarget(): string | null {
  if (typeof window === "undefined") return null;
  return rememberChatTargetFromLocation() ?? normalizedTarget(window.sessionStorage.getItem(pendingChatTargetKey));
}

export function consumePendingChatTarget(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(pendingChatTargetKey);
  const url = new URL(window.location.href);
  if (!url.searchParams.has("chat")) return;
  url.searchParams.delete("chat");
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

function normalizedTarget(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return chatTargetPattern.test(normalized) ? normalized : null;
}
