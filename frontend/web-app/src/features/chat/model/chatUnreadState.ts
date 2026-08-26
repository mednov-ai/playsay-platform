import type { ChatConversation, ChatReadReceipt, ChatUnreadState } from "../api/chatApi";

export type ChatUnreadEntry = {
  count: number;
  version: number;
  causeMessageId: string | null;
};

export type ChatUnreadMap = Record<string, ChatUnreadEntry>;

export function applyConversationSnapshot(
  current: ChatUnreadMap,
  conversations: ChatConversation[],
): ChatUnreadMap {
  let changed = false;
  const next = { ...current };
  for (const conversation of conversations) {
    const previous = current[conversation.id];
    if (previous && previous.version > conversation.unreadVersion) continue;
    const entry: ChatUnreadEntry = {
      count: conversation.unreadCount,
      version: conversation.unreadVersion,
      causeMessageId: conversation.lastMessage?.id ?? previous?.causeMessageId ?? null,
    };
    if (!sameEntry(previous, entry)) {
      next[conversation.id] = entry;
      changed = true;
    }
  }
  return changed ? next : current;
}

export function applyUnreadUpdate(current: ChatUnreadMap, update: ChatUnreadState): ChatUnreadMap {
  const previous = current[update.conversationId];
  if (previous && previous.version > update.unreadVersion) return current;
  if (
    previous
    && previous.version === update.unreadVersion
    && update.causeMessageId
    && previous.causeMessageId === update.causeMessageId
  ) return current;
  const entry: ChatUnreadEntry = {
    count: update.unreadCount,
    version: update.unreadVersion,
    causeMessageId: update.causeMessageId ?? update.lastReadMessageId ?? previous?.causeMessageId ?? null,
  };
  if (sameEntry(previous, entry)) return current;
  return { ...current, [update.conversationId]: entry };
}

export function applyReadReceipt(current: ChatUnreadMap, receipt: ChatReadReceipt): ChatUnreadMap {
  return applyUnreadUpdate(current, {
    conversationId: receipt.conversationId,
    unreadCount: receipt.unreadCount,
    unreadVersion: receipt.unreadVersion,
    lastReadMessageId: receipt.lastReadMessageId,
  });
}

export function unreadCountFor(map: ChatUnreadMap, conversation: ChatConversation): number {
  return map[conversation.id]?.count ?? conversation.unreadCount;
}

export function totalUnreadCount(map: ChatUnreadMap): number {
  return Object.values(map).reduce((total, entry) => total + entry.count, 0);
}

function sameEntry(left: ChatUnreadEntry | undefined, right: ChatUnreadEntry): boolean {
  return Boolean(
    left
    && left.count === right.count
    && left.version === right.version
    && left.causeMessageId === right.causeMessageId,
  );
}
