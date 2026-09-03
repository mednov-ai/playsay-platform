import { afterEach, beforeEach, expect, it, vi } from "vitest";

const handlers = new Map<string, (event: unknown) => void>();
const matchAll = vi.fn();
const showNotification = vi.fn();
const openWindow = vi.fn();
const payload = { version: 1, type: "chat.message", templateKey: "chat-new-message", locale: "fr",
  messageId: "00000000-0000-4000-8000-000000000001", conversationId: "00000000-0000-4000-8000-000000000002" };
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  handlers.clear();
  matchAll.mockResolvedValue([]);
  showNotification.mockResolvedValue(undefined);
  vi.stubGlobal("addEventListener", (type: string, listener: (event: unknown) => void) => handlers.set(type, listener));
  vi.stubGlobal("clients", { matchAll, openWindow });
  vi.stubGlobal("registration", { showNotification });
  vi.stubGlobal("location", { origin: "https://online.honeyschool.ru" });
  await import("./chatServiceWorker");
});
afterEach(() => vi.unstubAllGlobals());
async function emit(type: string, event: Record<string, unknown>) {
  const pending: Promise<unknown>[] = [];
  handlers.get(type)?.({ ...event, waitUntil: (value: Promise<unknown>) => pending.push(value) });
  await Promise.all(pending);
}
it("displays a generic localized notification once with no clients or hidden clients", async () => {
  await emit("push", { data: { json: () => payload } });
  await emit("push", { data: { json: () => payload } });
  expect(showNotification).toHaveBeenCalledOnce();
  expect(showNotification.mock.calls[0][1]).toEqual(expect.objectContaining({
    data: { conversationId: payload.conversationId }, tag: `chat-message-${payload.messageId}`,
  }));
  matchAll.mockResolvedValue([{ visibilityState: "hidden" }]);
  await emit("push", { data: { json: () => ({ ...payload, messageId: "00000000-0000-4000-8000-000000000003" }) } });
  expect(showNotification).toHaveBeenCalledTimes(2);
});
it("suppresses visible notifications and ignores malformed payloads", async () => {
  const postMessage = vi.fn();
  matchAll.mockResolvedValue([{ visibilityState: "visible", postMessage }]);
  await emit("push", { data: { json: () => payload } });
  await emit("push", { data: { json: () => { throw new Error("invalid JSON"); } } });
  expect(showNotification).not.toHaveBeenCalled();
  expect(postMessage).toHaveBeenCalledOnce();
});
it("uses only the worker origin for clicks and rejects invalid conversation identifiers", async () => {
  const close = vi.fn();
  await emit("notificationclick", { notification: { close, data: { conversationId: "https://evil.test/" } } });
  expect(openWindow).not.toHaveBeenCalled();
  await emit("notificationclick", { notification: { close, data: { conversationId: payload.conversationId } } });
  expect(openWindow).toHaveBeenCalledWith(`https://online.honeyschool.ru/?chat=${payload.conversationId}`);
  const navigate = vi.fn(), focus = vi.fn();
  matchAll.mockResolvedValue([{ url: "https://online.honeyschool.ru/", navigate, focus }]);
  await emit("notificationclick", { notification: { close, data: { conversationId: payload.conversationId } } });
  expect(navigate).toHaveBeenCalledWith(`https://online.honeyschool.ru/?chat=${payload.conversationId}`);
  expect(focus).toHaveBeenCalledOnce();
});
