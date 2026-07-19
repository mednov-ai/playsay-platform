import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../api/chatApi";
import { mergeMessages, messageStatus } from "./GlobalToolsRail";

describe("chat message state", () => {
  it("replaces an optimistic message with the persisted response and keeps chronological order", () => {
    const later = message({ clientMessageId: "later", createdAt: "2026-07-19T10:02:00Z", id: "later" });
    const optimistic = message({
      clientMessageId: "client-1",
      createdAt: "2026-07-19T10:01:00Z",
      id: "optimistic:client-1",
    });
    const persisted = message({
      clientMessageId: "client-1",
      createdAt: "2026-07-19T10:01:00Z",
      id: "persisted",
    });

    expect(mergeMessages([later, optimistic], [persisted]).map((item) => item.id))
      .toEqual(["persisted", "later"]);
  });

  it("deduplicates repeated realtime delivery by client message id", () => {
    const persisted = message({ clientMessageId: "client-1", id: "persisted" });

    expect(mergeMessages([persisted], [persisted])).toEqual([persisted]);
  });

  it("maps optimistic, saved, delivered and read messages to WhatsApp-style states", () => {
    expect(messageStatus(message({ id: "optimistic:client" }))).toBe("sending");
    expect(messageStatus(message({}))).toBe("sent");
    expect(messageStatus(message({ deliveredAt: "2026-07-19T10:00:01Z" }))).toBe("delivered");
    expect(messageStatus(message({
      deliveredAt: "2026-07-19T10:00:01Z",
      readAt: "2026-07-19T10:00:02Z",
    }))).toBe("read");
  });
});

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "message",
    conversationId: "conversation",
    senderSubject: "teacher",
    clientMessageId: "client",
    text: "Hello",
    createdAt: "2026-07-19T10:00:00Z",
    deliveredAt: null,
    readAt: null,
    ...overrides,
  };
}
