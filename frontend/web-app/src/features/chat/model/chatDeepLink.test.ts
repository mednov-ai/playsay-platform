// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  consumePendingChatTarget,
  readPendingChatTarget,
  rememberChatTargetFromLocation,
} from "./chatDeepLink";

const conversationId = "123e4567-e89b-42d3-a456-426614174000";

describe("chat email deep link", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("survives an authentication callback in the same tab", () => {
    window.history.replaceState({}, "", `/?chat=${conversationId}`);
    expect(rememberChatTargetFromLocation()).toBe(conversationId);

    window.history.replaceState({}, "", "/auth/callback?code=code&state=state");
    expect(readPendingChatTarget()).toBe(conversationId);
  });

  it("consumes only the chat parameter and preserves other URL state", () => {
    window.history.replaceState({}, "", `/?chat=open&source=email#messages`);
    expect(readPendingChatTarget()).toBe("open");

    consumePendingChatTarget();

    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?source=email");
    expect(window.location.hash).toBe("#messages");
    expect(readPendingChatTarget()).toBeNull();
  });

  it("ignores invalid conversation identifiers", () => {
    window.history.replaceState({}, "", "/?chat=../../admin");
    expect(readPendingChatTarget()).toBeNull();
  });
});
