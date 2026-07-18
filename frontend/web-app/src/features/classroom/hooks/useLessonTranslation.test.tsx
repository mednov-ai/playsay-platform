// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLessonTranslation } from "./useLessonTranslation";

const liveKit = vi.hoisted(() => ({
  createSession: vi.fn(),
  publishData: vi.fn(),
  roomOff: vi.fn(),
  roomOn: vi.fn(),
}));

vi.mock("@livekit/components-react", () => ({
  useRemoteParticipants: () => [],
  useRoomContext: () => ({
    localParticipant: { publishData: liveKit.publishData },
    off: liveKit.roomOff,
    on: liveKit.roomOn,
  }),
}));

vi.mock("../../../shared/api/playsay", () => ({
  ApiError: class ApiError extends Error {},
  createLessonTranslationSession: liveKit.createSession,
}));

describe("useLessonTranslation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not install translation handlers or call its API without profile permission", () => {
    const { result, unmount } = renderHook(() => useLessonTranslation({
      allowed: false,
      lessonId: "lesson-1",
      lessonType: "INDIVIDUAL",
      role: "teacher",
    }));

    expect(result.current.canEnable).toBe(false);
    expect(liveKit.roomOn).not.toHaveBeenCalled();
    expect(liveKit.publishData).not.toHaveBeenCalled();
    expect(liveKit.createSession).not.toHaveBeenCalled();

    unmount();
  });
});
