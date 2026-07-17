// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassroomMediaChoices } from "../../features/classroom";
import type { ScheduledLesson } from "../../shared/api/playsay";
import { useScheduleActions } from "./useScheduleActions";

const apiMocks = vi.hoisted(() => ({
  enterScheduledLessonRoom: vi.fn(),
}));

vi.mock("../../shared/api/playsay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../shared/api/playsay")>()),
  enterScheduledLessonRoom: apiMocks.enterScheduledLessonRoom,
}));

vi.mock("../../shared/i18n", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

describe("useScheduleActions classroom entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.enterScheduledLessonRoom.mockResolvedValue({
      expiresAt: "2026-07-17T12:00:00Z",
      identity: "student-demo",
      roomName: "lesson-lesson-1",
      serverUrl: "wss://online.play-and-say.ru/livekit",
      token: "token",
    });
  });

  it("opens pre-join without requesting a LiveKit token", async () => {
    const input = setup();
    const { result } = renderHook(() => useScheduleActions(input.props));

    await act(() => result.current.joinScheduledLesson(input.lesson));

    expect(input.navigateToPath).toHaveBeenCalledWith("/lessons/lesson-1/classroom");
    expect(apiMocks.enterScheduledLessonRoom).not.toHaveBeenCalled();
  });

  it("requests a fresh token only after device choices are confirmed", async () => {
    const input = setup();
    const { result } = renderHook(() => useScheduleActions(input.props));

    await act(() => result.current.confirmScheduledLessonJoin(input.lesson, mediaChoices));

    expect(apiMocks.enterScheduledLessonRoom).toHaveBeenCalledWith("lesson-1");
    expect(input.setRoomSession).toHaveBeenCalledWith(expect.objectContaining({
      lessonId: "lesson-1",
      lessonUpdatedAt: "2026-07-17T09:00:00Z",
      mediaChoices,
      token: "token",
    }));
  });
});

const mediaChoices: ClassroomMediaChoices = {
  audioDeviceId: "mic-1",
  audioEnabled: true,
  audioOutputDeviceId: "speaker-1",
  videoDeviceId: "camera-1",
  videoEnabled: true,
};

function setup() {
  const lesson = {
    courseTitle: "Starter",
    createdAt: "2026-07-17T09:00:00Z",
    id: "lesson-1",
    lessonTitle: "Speaking",
    participants: [{ subject: "student-demo" }],
    scheduledEnd: "2026-07-17T11:00:00Z",
    scheduledStart: "2026-07-17T10:00:00Z",
    status: "IN_PROGRESS",
    type: "INDIVIDUAL",
    updatedAt: "2026-07-17T09:00:00Z",
    workMode: "SHARED",
  } as ScheduledLesson;
  const navigateToPath = vi.fn();
  const setRoomSession = vi.fn();
  return {
    lesson,
    navigateToPath,
    setRoomSession,
    props: {
      applySessionError: (_caught: unknown, fallback: string) => fallback,
      navigateToPath,
      profile: null,
      scheduledLessons: [lesson],
      setMaterialLoading: vi.fn(),
      setRoomLoadingLessonId: vi.fn(),
      setRoomMessage: vi.fn(),
      setRoomSession,
      setScheduleLoading: vi.fn(),
      setScheduleMessage: vi.fn(),
      setScheduledLessons: vi.fn(),
      setStudentUsers: vi.fn(),
      studentUsers: [],
    },
  };
}
