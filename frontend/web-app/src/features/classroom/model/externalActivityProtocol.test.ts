import { describe, expect, it } from "vitest";
import {
  externalActivityCaptureConstraints,
  externalActivityCaptureErrorCode,
  externalActivityInputReliable,
  externalActivitySessionIdFromTrackName,
  externalActivityExtensionErrorCode,
  externalActivityParticipantPhase,
  externalActivityTrackName,
  isCurrentExternalActivityCapture,
  parseExternalActivityMessage,
  parseExtensionEvent,
  participantCanHostExternalActivity,
} from "./externalActivityProtocol";

describe("external activity classroom protocol", () => {
  it("reports a safe browser capture error name without exposing its message", () => {
    expect(externalActivityCaptureErrorCode(new DOMException("private device detail", "NotReadableError")))
      .toBe("CAPTURE_START_FAILED");
    expect(externalActivityCaptureErrorCode(new DOMException("private permission detail", "NotAllowedError")))
      .toBe("CAPTURE_PERMISSION_DENIED");
    expect(externalActivityCaptureErrorCode(new DOMException("private browser detail", "NotSupportedError")))
      .toBe("CAPTURE_NOT_SUPPORTED");
    expect(externalActivityCaptureErrorCode("unexpected"))
      .toBe("CAPTURE_START_FAILED");
  });

  it("normalizes extension failures without returning raw browser text", () => {
    expect(externalActivityExtensionErrorCode("TAB_CLOSED")).toBe("TARGET_TAB_CLOSED");
    expect(externalActivityExtensionErrorCode("ERROR", "NotAllowedError: private permission detail"))
      .toBe("CAPTURE_PERMISSION_DENIED");
    expect(externalActivityExtensionErrorCode("ERROR", "NotSupportedError: private browser detail"))
      .toBe("CAPTURE_NOT_SUPPORTED");
    expect(externalActivityExtensionErrorCode("ERROR", "private unknown detail"))
      .toBe("EXTENSION_ERROR_UNKNOWN");
  });

  it("maps host-only readiness detail to the backward-compatible participant phase", () => {
    expect(externalActivityParticipantPhase("OPENING_PROVIDER")).toBe("AWAITING_EXTENSION");
    expect(externalActivityParticipantPhase("AWAITING_ACTION")).toBe("AWAITING_EXTENSION");
    expect(externalActivityParticipantPhase("ACTIVE")).toBe("ACTIVE");
  });

  it("uses Chrome tab-capture constraints without incompatible camera constraints", () => {
    expect(externalActivityCaptureConstraints("stream-1")).toEqual({
      audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: "stream-1" } },
      video: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: "stream-1" } },
    });
  });

  it("keeps click and keyboard delivery reliable while pointer moves stay realtime", () => {
    expect(externalActivityInputReliable({ type: "pointer", action: "move", x: 1, y: 2 })).toBe(false);
    expect(externalActivityInputReliable({ type: "pointer", action: "down", x: 1, y: 2 })).toBe(true);
    expect(externalActivityInputReliable({ type: "key", action: "down", key: "a" })).toBe(true);
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
    expect(parseExtensionEvent({ version: 1, type: "AWAITING_ACTION", sessionId: "session-1" }, "session-1"))
      .toMatchObject({ type: "AWAITING_ACTION" });
    expect(parseExtensionEvent({ version: 1, type: "CAPTURE_READY", sessionId: "session-1", streamId: "stream-1" }, "session-1")).toMatchObject({ streamId: "stream-1" });
    expect(parseExtensionEvent({ version: 1, type: "CAPTURE_READY", sessionId: "other", streamId: "stream-1" }, "session-1")).toBeNull();
    expect(parseExtensionEvent({ version: 1, type: "PRIVATE_EVENT", sessionId: "session-1" }, "session-1")).toBeNull();
  });

  it("rejects a late capture after either session or generation changes", () => {
    expect(isCurrentExternalActivityCapture(3, "session-3", 3, { sessionId: "session-3" })).toBe(true);
    expect(isCurrentExternalActivityCapture(2, "session-2", 3, { sessionId: "session-3" })).toBe(false);
    expect(isCurrentExternalActivityCapture(3, "session-2", 3, { sessionId: "session-3" })).toBe(false);
  });

  it("uses a reserved track prefix", () => {
    expect(externalActivityTrackName("session-1", "video")).toBe("playsay-external-activity-session-1-video");
    expect(externalActivitySessionIdFromTrackName("playsay-external-activity-session-1-video")).toBe("session-1");
    expect(externalActivitySessionIdFromTrackName("camera-video")).toBeNull();
  });

  it("trusts host state only from teacher or admin LiveKit metadata", () => {
    expect(participantCanHostExternalActivity('{"playsayRole":"TEACHER"}')).toBe(true);
    expect(participantCanHostExternalActivity('{"playsayRole":"ADMIN"}')).toBe(true);
    expect(participantCanHostExternalActivity('{"playsayRole":"STUDENT"}')).toBe(false);
    expect(participantCanHostExternalActivity("invalid")).toBe(false);
  });

  it("trusts the lesson teacher identity when remote metadata is unavailable", () => {
    expect(participantCanHostExternalActivity(undefined, "teacher-subject", "teacher-subject")).toBe(true);
    expect(participantCanHostExternalActivity(undefined, "student-subject", "teacher-subject")).toBe(false);
  });
});
