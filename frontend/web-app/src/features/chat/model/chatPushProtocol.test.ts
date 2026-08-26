import { describe, expect, it } from "vitest";
import {
  chatPushTarget,
  parseChatPushPayload,
  shouldShowSystemNotification,
} from "./chatPushProtocol";

const validPayload = {
  version: 1,
  type: "chat.message",
  messageId: "00000000-0000-4000-8000-000000000001",
  conversationId: "00000000-0000-4000-8000-000000000002",
  locale: "de",
  templateKey: "chat-new-message",
} as const;

describe("chat push protocol", () => {
  it("accepts the privacy-safe versioned payload", () => {
    expect(parseChatPushPayload(validPayload)).toEqual(validPayload);
  });

  it("rejects malformed, unknown-version and content-bearing alternatives", () => {
    expect(parseChatPushPayload({ ...validPayload, version: 2 })).toBeNull();
    expect(parseChatPushPayload({ ...validPayload, conversationId: "../admin" })).toBeNull();
    expect(parseChatPushPayload({ ...validPayload, locale: "es" })).toBeNull();
    expect(parseChatPushPayload({ ...validPayload, body: "private chat text" })).toBeNull();
  });

  it("suppresses system notifications for a visible client", () => {
    expect(shouldShowSystemNotification(["hidden", "visible"])).toBe(false);
    expect(shouldShowSystemNotification(["hidden"])).toBe(true);
  });

  it("builds only a same-origin chat deep link", () => {
    expect(chatPushTarget("https://dev.online.honey.school/path", validPayload.conversationId))
      .toBe(`https://dev.online.honey.school/?chat=${validPayload.conversationId}`);
  });
});
