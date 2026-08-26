/// <reference lib="webworker" />

import { chatPushNotificationCatalog } from "./chatPushNotificationCatalog";
import {
  chatPushTarget,
  parseChatPushPayload,
  readChatPushConversationId,
  shouldShowSystemNotification,
} from "../features/chat/model/chatPushProtocol";

const worker = globalThis as unknown as ServiceWorkerGlobalScope;
const recentMessageIds = new Set<string>();

worker.addEventListener("push", (event: PushEvent) => {
  event.waitUntil(handlePush(event));
});

worker.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  event.waitUntil(openConversation(event.notification.data));
});

async function handlePush(event: PushEvent): Promise<void> {
  let rawPayload: unknown;
  try {
    rawPayload = event.data?.json();
  } catch {
    return;
  }
  const payload = parseChatPushPayload(rawPayload);
  if (!payload || recentMessageIds.has(payload.messageId)) return;
  remember(payload.messageId);
  const windows = await worker.clients.matchAll({ includeUncontrolled: true, type: "window" });
  if (!shouldShowSystemNotification(windows.map((client) => client.visibilityState))) {
    windows.forEach((client) => client.postMessage({
      type: "chat.push.received",
      conversationId: payload.conversationId,
      messageId: payload.messageId,
    }));
    return;
  }
  const text = chatPushNotificationCatalog[payload.locale];
  await worker.registration.showNotification(text.title, {
    body: text.body,
    data: { conversationId: payload.conversationId },
    tag: `chat-message-${payload.messageId}`,
  });
}

async function openConversation(data: unknown): Promise<void> {
  const conversationId = readChatPushConversationId(data);
  if (!conversationId) return;
  const target = chatPushTarget(worker.location.origin, conversationId);
  const windows = await worker.clients.matchAll({ includeUncontrolled: true, type: "window" });
  const client = windows.find((candidate) => new URL(candidate.url).origin === worker.location.origin);
  if (client) {
    await client.navigate(target);
    await client.focus();
    return;
  }
  await worker.clients.openWindow(target);
}

function remember(messageId: string): void {
  recentMessageIds.add(messageId);
  if (recentMessageIds.size <= 200) return;
  const first = recentMessageIds.values().next().value;
  if (first) recentMessageIds.delete(first);
}

export {};
