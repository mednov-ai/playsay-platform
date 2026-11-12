// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MeProfile } from "../../../shared/api/playsay";
import { ru } from "../../../shared/i18n/resources/ru";
import { en } from "../../../shared/i18n/resources/en";
import { de } from "../../../shared/i18n/resources/de";
import { fr } from "../../../shared/i18n/resources/fr";
import { GlobalToolsRail } from "./GlobalToolsRail";

const mocks = vi.hoisted(() => ({ contacts: vi.fn(), conversations: vi.fn(), messages: vi.fn(), open: vi.fn(), read: vi.fn(), t: (key: string) => key }));
vi.mock("../../../shared/i18n", () => ({ useAppTranslation: () => ({ t: mocks.t, i18n: { language: "en" } }) }));
vi.mock("../model/useChatPushSubscription", () => ({ useChatPushSubscription: () => ({ status: "disabled", enable: vi.fn(), disable: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../api/chatApi", () => ({ fetchChatContacts: mocks.contacts, fetchChatConversations: mocks.conversations,
  fetchChatMessages: mocks.messages, markChatRead: mocks.read, openChatSocket: mocks.open }));

const profile = { subject: "teacher", roles: ["TEACHER"] } as MeProfile;
const contact = { subject: "student", displayName: "Synthetic Student", role: "STUDENT" };
const message = (id: string, text: string, senderSubject: string) => ({ id, conversationId: "dialog", senderSubject,
  clientMessageId: id, text, createdAt: "2026-01-01T00:00:00Z", deliveredAt: null, readAt: null });
const oldMessage = message("old", "Earlier message", "teacher");
const missed = message("missed", "Message received while offline", "student");
let sockets: Array<{ onclose: (() => void) | null; onopen: (() => void) | null; onmessage: ((event: MessageEvent) => void) | null; onerror: (() => void) | null; close: () => void }>;

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  mocks.contacts.mockResolvedValue([contact]);
  mocks.conversations.mockResolvedValue([{ id: "dialog", counterpart: contact, lastMessage: oldMessage, unreadCount: 0, unreadVersion: 0, createdAt: oldMessage.createdAt }]);
  mocks.messages.mockResolvedValue({ items: [oldMessage], nextCursor: null });
  mocks.read.mockResolvedValue({ conversationId: "dialog", readerSubject: "teacher", lastReadMessageId: "missed", readAt: "2026-01-01T00:01:00Z", unreadCount: 0, unreadVersion: 1 });
  sockets = [];
  mocks.open.mockImplementation(async () => {
    const socket = { onclose: null, onopen: null, onmessage: null, onerror: null, close: vi.fn() };
    sockets.push(socket);
    return socket;
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("recovers missed messages in the open conversation while reconnecting without duplication", async () => {
  render(<GlobalToolsRail profile={profile} />);
  fireEvent.click(screen.getByRole("button", { name: "chat.open" }));
  fireEvent.click(await screen.findByRole("button", { name: /Synthetic Student/ }));
  await screen.findByText("Earlier message");
  await waitFor(() => expect(sockets[0]?.onclose).toBeTypeOf("function"));
  mocks.messages.mockResolvedValue({ items: [oldMessage, missed], nextCursor: null });
  act(() => sockets[0].onclose?.());
  expect(screen.getByRole("status").textContent).toBe("chat.reconnecting");
  await screen.findByText("Message received while offline", {}, { timeout: 4_000 });
  await waitFor(() => expect(sockets[1]?.onopen).toBeTypeOf("function"));
  act(() => sockets[1].onopen?.());
  expect(screen.queryByRole("status")).toBeNull();
  await waitFor(() => expect(mocks.messages.mock.calls.length).toBeGreaterThanOrEqual(3));
  expect(screen.getAllByText("Message received while offline")).toHaveLength(1);
});

it("does not apply an in-flight recovery to a conversation the user has left", async () => {
  let finish!: (value: { items: typeof missed[]; nextCursor: null }) => void;
  const later = new Promise<{ items: typeof missed[]; nextCursor: null }>(resolve => { finish = resolve; });
  mocks.messages.mockResolvedValueOnce({ items: [oldMessage], nextCursor: null }).mockReturnValueOnce(later);
  render(<GlobalToolsRail profile={profile} />);
  fireEvent.click(screen.getByRole("button", { name: "chat.open" }));
  fireEvent.click(await screen.findByRole("button", { name: /Synthetic Student/ }));
  await screen.findByText("Earlier message");
  await waitFor(() => expect(sockets[0]?.onopen).toBeTypeOf("function"));
  act(() => sockets[0].onopen?.());
  await waitFor(() => expect(mocks.messages).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "chat.back" }));
  await act(async () => { finish({ items: [missed], nextCursor: null }); await later; });
  expect(screen.queryByText("Message received while offline")).toBeNull();
  expect(mocks.read).not.toHaveBeenCalled();
});

it("provides a translated reconnecting status in every supported locale", () => {
  for (const resource of [ru, en, de, fr]) {
    expect(resource.chat.reconnecting).toBeTruthy();
    expect(resource.chat.reconnecting).not.toBe("chat.reconnecting");
  }
});

it("retries when creating the socket fails and clears the status on connection", async () => {
  const open = mocks.open.getMockImplementation()!;
  mocks.open.mockRejectedValueOnce(new Error("temporarily unavailable")).mockImplementation(open);
  render(<GlobalToolsRail profile={profile} />);
  fireEvent.click(screen.getByRole("button", { name: "chat.open" }));
  expect((await screen.findByText("chat.reconnecting")).getAttribute("role")).toBe("status");
  await waitFor(() => expect(sockets[0]?.onopen).toBeTypeOf("function"), { timeout: 4_000 });
  act(() => sockets[0].onopen?.());
  expect(screen.queryByText("chat.reconnecting")).toBeNull();
});

it("closes a socket that is created after the component is unmounted", async () => {
  let finish!: (socket: { close: () => void }) => void;
  const pending = new Promise<{ close: () => void }>(resolve => { finish = resolve; });
  mocks.open.mockReturnValueOnce(pending);
  const view = render(<GlobalToolsRail profile={profile} />);
  view.unmount();
  const socket = { close: vi.fn() };
  await act(async () => { finish(socket); await pending; });
  expect(socket.close).toHaveBeenCalledOnce();
});

it("keeps one recovery request in flight and rechecks after the socket opens", async () => {
  let finish!: (value: { items: typeof missed[]; nextCursor: null }) => void;
  const pending = new Promise<{ items: typeof missed[]; nextCursor: null }>(resolve => { finish = resolve; });
  mocks.messages.mockResolvedValueOnce({ items: [oldMessage], nextCursor: null }).mockReturnValueOnce(pending)
    .mockResolvedValue({ items: [oldMessage, missed], nextCursor: null });
  render(<GlobalToolsRail profile={profile} />);
  fireEvent.click(screen.getByRole("button", { name: "chat.open" }));
  fireEvent.click(await screen.findByRole("button", { name: /Synthetic Student/ }));
  await screen.findByText("Earlier message");
  act(() => sockets[0].onopen?.());
  await waitFor(() => expect(mocks.messages).toHaveBeenCalledTimes(2));
  act(() => sockets[0].onclose?.());
  await waitFor(() => expect(sockets[1]?.onopen).toBeTypeOf("function"), { timeout: 4_000 });
  act(() => sockets[1].onopen?.());
  expect(mocks.messages).toHaveBeenCalledTimes(2);
  await act(async () => { finish({ items: [oldMessage], nextCursor: null }); await pending; });
  await screen.findByText("Message received while offline");
  expect(mocks.messages).toHaveBeenCalledTimes(3);
});

it("aborts and ignores recovery after unmount", async () => {
  let finish!: (value: { items: typeof missed[]; nextCursor: null }) => void;
  const pending = new Promise<{ items: typeof missed[]; nextCursor: null }>(resolve => { finish = resolve; });
  mocks.messages.mockResolvedValueOnce({ items: [oldMessage], nextCursor: null }).mockReturnValueOnce(pending);
  const view = render(<GlobalToolsRail profile={profile} />);
  fireEvent.click(screen.getByRole("button", { name: "chat.open" }));
  fireEvent.click(await screen.findByRole("button", { name: /Synthetic Student/ }));
  await screen.findByText("Earlier message");
  act(() => sockets[0].onopen?.());
  await waitFor(() => expect(mocks.messages).toHaveBeenCalledTimes(2));
  const signal = mocks.messages.mock.calls[1][2] as AbortSignal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => { finish({ items: [missed], nextCursor: null }); await pending; });
  expect(mocks.read).not.toHaveBeenCalled();
});

it("times out a stalled recovery so the next reconnect can retry", async () => {
  let requestSignal: AbortSignal | undefined;
  mocks.messages.mockResolvedValueOnce({ items: [oldMessage], nextCursor: null }).mockImplementationOnce((_id, _cursor, signal: AbortSignal) => {
    requestSignal = signal;
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true }));
  }).mockResolvedValue({ items: [oldMessage, missed], nextCursor: null });
  render(<GlobalToolsRail profile={profile} />);
  fireEvent.click(screen.getByRole("button", { name: "chat.open" }));
  fireEvent.click(await screen.findByRole("button", { name: /Synthetic Student/ }));
  await screen.findByText("Earlier message");
  vi.useFakeTimers();
  act(() => sockets[0].onopen?.());
  expect(requestSignal?.aborted).toBe(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(requestSignal?.aborted).toBe(true);
  act(() => sockets[0].onclose?.());
  await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
  expect(mocks.messages).toHaveBeenCalledTimes(3);
  expect(screen.getByText("Message received while offline")).toBeDefined();
});
