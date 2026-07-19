import { authConfig, getValidAccessToken } from "../../../shared/api/auth";
import { apiJson } from "../../../shared/api/http";

export type ChatContact = {
  subject: string;
  displayName: string;
  role: "TEACHER" | "STUDENT";
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderSubject: string;
  clientMessageId: string;
  text: string;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
};

export type ChatConversation = {
  id: string;
  counterpart: ChatContact;
  lastMessage: ChatMessage | null;
  unreadCount: number;
  createdAt: string;
};

export type ChatMessagePage = {
  items: ChatMessage[];
  nextCursor: string | null;
};

export type ChatReadReceipt = {
  conversationId: string;
  readerSubject: string;
  lastReadMessageId: string;
  readAt: string;
};

export type ChatDeliveryReceipt = {
  conversationId: string;
  recipientSubject: string;
  messageIds: string[];
  deliveredAt: string;
};

export type ChatRealtimeMessage = {
  type?: "connected" | "chat.message.created" | "chat.messages.delivered" | "chat.conversation.read";
  message?: ChatMessage;
  delivery?: ChatDeliveryReceipt;
  receipt?: ChatReadReceipt;
};

export function fetchChatContacts(): Promise<ChatContact[]> {
  return apiJson("/api/chat/contacts", { method: "GET" }, authConfig);
}

export function fetchChatConversations(): Promise<ChatConversation[]> {
  return apiJson("/api/chat/conversations", { method: "GET" }, authConfig);
}

export function createChatConversation(participantSubject: string): Promise<ChatConversation> {
  return apiJson(
    "/api/chat/conversations",
    { body: JSON.stringify({ participantSubject }), method: "POST" },
    authConfig,
    201,
  );
}

export function fetchChatMessages(conversationId: string, cursor?: string | null): Promise<ChatMessagePage> {
  const params = new URLSearchParams({ limit: "50" });
  if (cursor) params.set("cursor", cursor);
  return apiJson(
    `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
    { method: "GET" },
    authConfig,
  );
}

export function sendChatMessage(conversationId: string, clientMessageId: string, text: string): Promise<ChatMessage> {
  return apiJson(
    `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
    { body: JSON.stringify({ clientMessageId, text }), method: "POST" },
    authConfig,
    201,
  );
}

export function markChatRead(conversationId: string, lastReadMessageId: string): Promise<ChatReadReceipt> {
  return apiJson(
    `/api/chat/conversations/${encodeURIComponent(conversationId)}/read`,
    { body: JSON.stringify({ lastReadMessageId }), method: "PUT" },
    authConfig,
  );
}

export async function openChatSocket(): Promise<WebSocket | null> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return null;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(`${protocol}//${window.location.host}/api/ws/chat`, ["playsay", accessToken]);
}
