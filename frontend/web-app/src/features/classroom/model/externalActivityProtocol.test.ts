import { describe, expect, it } from "vitest";
import {
  externalActivityCaptureConstraints,
  externalActivityCaptureErrorCode,
  externalActivityTrackName,
  isCurrentExternalActivityCapture,
  parseExternalActivityMessage,
  parseExtensionEvent,
  participantCanHostExternalActivity,
} from "./externalActivityProtocol";

describe("external activity classroom protocol", () => {
  it("reports a safe browser capture error name without exposing its message", () => {
    expect(externalActivityCaptureErrorCode(new DOMException("private device detail", "NotReadableError")))
      .toBe("CAPTURE_FAILED_NOT_READABLE_ERROR");
    expect(externalActivityCaptureErrorCode("unexpected"))
      .toBe("CAPTURE_FAILED_UNKNOWN_ERROR");
  });

  it("uses Chrome tab-capture constraints without incompatible camera constraints", () => {
    expect(externalActivityCaptureConstraints("stream-1")).toEqual({
      audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: "stream-1" } },
      video: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: "stream-1" } },
    });
  });

  it("accepts versioned requests and rejects untrusted shapes", () => {
    expect(parseExternalActivityMessage({ version: 1, type: "REQUEST_OPEN", sessionId: "session-1", blockId: "block-1" })).toMatchObject({
      type: "REQUEST_OPEN",
      sessionId: "session-1",
      blockId: "block-1",
    });
    expect(parseExternalActivityMessage({ version: 2, type: "REQUEST_OPEN", sessionId: "session-1", blockId: "block-1" })).toBeNull();
    expect(parseExternalActivityMessage({ version: 1, type: "INPUT", sessionId: "session-1", blockId: "block-1", input: { type: "clipboard" } })).toBeNull();
    expect(parseExternalActivityMessage({
      version: 1,
      type: "INPUT",
      sessionId: "session-1",
      blockId: "block-1",
      input: { type: "key", action: "down", key: "a" },
    })).toBeNull();
    expect(parseExternalActivityMessage({
      version: 1,
      type: "INPUT",
      eventId: "event-1",
      sessionId: "session-1",
      blockId: "block-1",
      input: { type: "key", action: "down", key: "a" },
    })).toMatchObject({ eventId: "event-1", type: "INPUT" });
    expect(parseExternalActivityMessage({
      version: 1,
      type: "REQUEST_STATE",
      sessionId: "current",
      blockId: "current",
    })).toMatchObject({ type: "REQUEST_STATE" });
  });

  it("accepts extension capture only for the expected session", () => {
    expect(parseExtensionEvent({ version: 1, type: "CAPTURE_READY", sessionId: "session-1", streamId: "stream-1" }, "session-1")).toMatchObject({ streamId: "stream-1" });
    expect(parseExtensionEvent({ version: 1, type: "CAPTURE_READY", sessionId: "other", streamId: "stream-1" }, "session-1")).toBeNull();
  });

  it("rejects a late capture after either session or generation changes", () => {
    expect(isCurrentExternalActivityCapture(3, "session-3", 3, { sessionId: "session-3" })).toBe(true);
    expect(isCurrentExternalActivityCapture(2, "session-2", 3, { sessionId: "session-3" })).toBe(false);
    expect(isCurrentExternalActivityCapture(3, "session-2", 3, { sessionId: "session-3" })).toBe(false);
  });

  it("uses a reserved track prefix", () => {
    expect(externalActivityTrackName("session-1", "video")).toBe("playsay-external-activity-session-1-video");
  });

  it("trusts host state only from teacher or admin LiveKit metadata", () => {
    expect(participantCanHostExternalActivity('{"playsayRole":"TEACHER"}')).toBe(true);
    expect(participantCanHostExternalActivity('{"playsayRole":"ADMIN"}')).toBe(true);
    expect(participantCanHostExternalActivity('{"playsayRole":"STUDENT"}')).toBe(false);
    expect(participantCanHostExternalActivity("invalid")).toBe(false);
  });
});
