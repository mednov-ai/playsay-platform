import { chatPushNotificationCatalog, type ChatPushLocale } from "../../../service-worker/chatPushNotificationCatalog";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const payloadKeys = ["conversationId", "locale", "messageId", "templateKey", "type", "version"];

export type ChatPushPayload = {
  version: 1;
  type: "chat.message";
  messageId: string;
  conversationId: string;
  locale: ChatPushLocale;
  templateKey: "chat-new-message";
};

export function parseChatPushPayload(value: unknown): ChatPushPayload | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ChatPushPayload>;
  if (
    Object.keys(candidate).sort().join(",") !== payloadKeys.join(",")
    || candidate.version !== 1
    || candidate.type !== "chat.message"
    || candidate.templateKey !== "chat-new-message"
    || typeof candidate.messageId !== "string"
    || typeof candidate.conversationId !== "string"
    || !uuidPattern.test(candidate.messageId)
    || !uuidPattern.test(candidate.conversationId)
    || !candidate.locale
    || !(candidate.locale in chatPushNotificationCatalog)
  ) return null;
  return candidate as ChatPushPayload;
}

export function readChatPushConversationId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const conversationId = (value as { conversationId?: unknown }).conversationId;
  return typeof conversationId === "string" && uuidPattern.test(conversationId) ? conversationId : null;
}

export function shouldShowSystemNotification(visibilityStates: string[]): boolean {
  return !visibilityStates.includes("visible");
}

export function chatPushTarget(origin: string, conversationId: string): string {
  return `${new URL(origin).origin}/?chat=${encodeURIComponent(conversationId)}`;
}
