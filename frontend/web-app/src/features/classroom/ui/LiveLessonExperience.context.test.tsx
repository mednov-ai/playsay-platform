// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LessonRoomSession } from "../model/session";
import { LiveLessonExperience } from "./LiveLessonExperience";

vi.mock("@livekit/components-react", () => ({
  LiveKitRoom: ({ children }: { children: ReactNode }) => (
    <div data-testid="livekit-room">{children}</div>
  ),
}));

vi.mock("../../../entities/workspace/model", () => ({
  canAssignLessons: () => true,
}));

vi.mock("../../../entities/schedule/model", () => ({
  formatLessonRange: () => "10:00–11:00",
  formatLessonType: () => "Group",
}));

vi.mock("../../../shared/i18n", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../../../app/AppProviders", () => ({
  useAppTheme: () => ({ mode: "light", resolvedTheme: "light", setMode: vi.fn() }),
}));

vi.mock("../../../shared/theme/ThemeToggle", () => ({
  ThemeToggle: () => <button type="button">theme</button>,
}));

vi.mock("../../../components/ui/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("./ClassroomVideoStage", () => ({
  ClassroomVideoStage: ({ mode }: { mode: string }) => <div data-mode={mode} data-testid="video-stage" />,
}));

vi.mock("./LessonWorkspace", () => ({
  LessonWorkspace: ({ onPresentationModeChange }: { onPresentationModeChange: (mode: string) => void }) => (
    <div data-testid="lesson-workspace">
      <button onClick={() => onPresentationModeChange("external-activity-focus")} type="button">focus external activity</button>
    </div>
  ),
}));

afterEach(() => cleanup());

describe("LiveLessonExperience room context", () => {
  it("keeps the video stage and lesson workspace inside the same LiveKit room", () => {
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));

    render(
      <LiveLessonExperience
        materials={[]}
        onAssignMaterial={vi.fn()}
        onComplete={vi.fn()}
        onLeave={vi.fn()}
        profile={{ name: "Teacher", username: "teacher" } as never}
        session={{
          courseTitle: "Course",
          expiresAt: "2026-07-20T11:15:00Z",
          identity: "teacher-1",
          lessonId: "lesson-1",
          lessonStartsAt: "2026-07-20T10:00:00Z",
          lessonEndsAt: "2026-07-20T11:00:00Z",
          lessonStatus: "IN_PROGRESS",
          lessonTemplateId: null,
          lessonTitle: "Shared activity",
          lessonTranslationAllowed: false,
          lessonType: "GROUP",
          lessonUpdatedAt: "2026-07-20T10:00:00Z",
          materialId: "material-1",
          mediaChoices: {
            audioDeviceId: "default",
            audioEnabled: false,
            audioOutputDeviceId: "default",
            videoDeviceId: "default",
            videoEnabled: false,
          },
          participants: [],
          participantPresence: {},
          roomName: "lesson-1",
          serverUrl: "wss://livekit.example.test",
          teacherName: "Teacher",
          teacherSubject: "teacher-1",
          token: "token",
          workMode: "SHARED",
        } satisfies LessonRoomSession}
      />,
    );

    const room = screen.getByTestId("livekit-room");
    expect(within(room).getByTestId("video-stage")).toBeInTheDocument();
    expect(within(room).getByTestId("lesson-workspace")).toBeInTheDocument();
  });

  it("switches the lesson shell to the external activity overlay mode", () => {
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));

    render(
      <LiveLessonExperience
        materials={[]}
        onAssignMaterial={vi.fn()}
        onComplete={vi.fn()}
        onLeave={vi.fn()}
        profile={{ name: "Teacher", username: "teacher" } as never}
        session={{
          courseTitle: "Course",
          expiresAt: "2026-07-20T11:15:00Z",
          identity: "teacher-1",
          lessonId: "lesson-1",
          lessonStartsAt: "2026-07-20T10:00:00Z",
          lessonEndsAt: "2026-07-20T11:00:00Z",
          lessonStatus: "IN_PROGRESS",
          lessonTemplateId: null,
          lessonTitle: "Shared activity",
          lessonTranslationAllowed: false,
          lessonType: "GROUP",
          lessonUpdatedAt: "2026-07-20T10:00:00Z",
          materialId: "material-1",
          mediaChoices: {
            audioDeviceId: "default",
            audioEnabled: false,
            audioOutputDeviceId: "default",
            videoDeviceId: "default",
            videoEnabled: false,
          },
          participants: [],
          participantPresence: {},
          roomName: "lesson-1",
          serverUrl: "wss://livekit.example.test",
          teacherName: "Teacher",
          teacherSubject: "teacher-1",
          token: "token",
          workMode: "SHARED",
        } satisfies LessonRoomSession}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "focus external activity" }));

    expect(screen.getByTestId("video-stage")).toHaveAttribute("data-mode", "externalActivity");
    expect(screen.getByTestId("video-stage").closest(".playsay-classroom-shell")).toHaveAttribute(
      "data-presentation-mode",
      "external-activity-focus",
    );
    expect(document.body).toHaveClass("playsay-classroom-external-activity-focus");
  });
});
