import { describe, expect, it } from "vitest";
import type { ChatConversation } from "../api/chatApi";
import {
  applyConversationSnapshot,
  applyUnreadUpdate,
  totalUnreadCount,
  type ChatUnreadMap,
} from "./chatUnreadState";

describe("chat unread reconciliation", () => {
  it("rejects a stale snapshot after a newer realtime update", () => {
    const realtime = applyUnreadUpdate({}, {
      conversationId: "conversation",
      unreadCount: 2,
      unreadVersion: 4,
      causeMessageId: "message-2",
    });

    expect(applyConversationSnapshot(realtime, [conversation({ unreadCount: 1, unreadVersion: 3 })]))
      .toEqual(realtime);
  });

  it("tracks an unknown conversation immediately and does not double count duplicate delivery", () => {
    const update = {
      conversationId: "unknown",
      unreadCount: 1,
      unreadVersion: 1,
      causeMessageId: "message",
    };
    const first = applyUnreadUpdate({}, update);
    const duplicate = applyUnreadUpdate(first, update);

    expect(totalUnreadCount(first)).toBe(1);
    expect(duplicate).toBe(first);
  });

  it("uses exact versioned counts instead of local increments", () => {
    const initial: ChatUnreadMap = {
      conversation: { count: 5, version: 5, causeMessageId: "old" },
    };
    const next = applyUnreadUpdate(initial, {
      conversationId: "conversation",
      unreadCount: 0,
      unreadVersion: 6,
      lastReadMessageId: "latest",
    });

    expect(totalUnreadCount(next)).toBe(0);
  });
});

function conversation(overrides: Partial<ChatConversation>): ChatConversation {
  return {
    id: "conversation",
    counterpart: { subject: "student", displayName: "Student", role: "STUDENT" },
    lastMessage: null,
    unreadCount: 0,
    unreadVersion: 0,
    createdAt: "2026-08-26T00:00:00Z",
    ...overrides,
  };
}
