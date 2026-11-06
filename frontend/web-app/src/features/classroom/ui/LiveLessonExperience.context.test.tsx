// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LessonRoomSession } from "../model/session";
import { LiveLessonExperience } from "./LiveLessonExperience";

const permissions = vi.hoisted(() => ({ canManage: true }));

vi.mock("@livekit/components-react", () => ({
  LiveKitRoom: ({ children }: { children: ReactNode }) => (
    <div data-testid="livekit-room">{children}</div>
  ),
  useRoomContext: () => ({ engine: { pcManager: undefined } }),
}));

vi.mock("../../../entities/workspace/model", () => ({
  canAssignLessons: () => permissions.canManage,
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
  ClassroomVideoStage: ({ mode, onScreenShareActiveChange }: { mode: string; onScreenShareActiveChange: (active: boolean) => void }) => (
    <div data-mode={mode} data-testid="video-stage">
      <button type="button" onClick={() => onScreenShareActiveChange(true)}>start share</button>
      <button type="button" onClick={() => onScreenShareActiveChange(false)}>stop share</button>
    </div>
  ),
}));

vi.mock("./ClassroomConnectionStatus", () => ({
  ClassroomConnectionStatus: () => <div data-testid="connection-status" />,
}));

vi.mock("./ClassroomMediaConnectionObserver", () => ({
  ClassroomMediaConnectionObserver: () => null,
}));

vi.mock("./LessonWorkspace", () => ({
  LessonWorkspace: ({ onPresentationModeChange }: { onPresentationModeChange: (mode: string) => void }) => (
    <div data-testid="lesson-workspace">
      <button onClick={() => onPresentationModeChange("external-activity-focus")} type="button">focus external activity</button>
    </div>
  ),
}));

afterEach(() => { cleanup(); permissions.canManage = true; vi.unstubAllGlobals(); });

describe("LiveLessonExperience room context", () => {
  it("activates tablet layout only for learners with material and preserves the room across screen-share transitions", () => {
    vi.stubGlobal("matchMedia", () => ({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() }));
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 Macintosh", platform: "MacIntel", maxTouchPoints: 5 });
    vi.stubGlobal("innerWidth", 768);
    vi.stubGlobal("innerHeight", 1024);
    permissions.canManage = false;
    const session = { ...classroomSession(), identity: "student-1" };
    const common = { materials: [], onAssignMaterial: vi.fn(), onComplete: vi.fn(), onLeave: vi.fn(), onMediaLifecycleChange: vi.fn(), onRetryMedia: vi.fn(), profile: null, recoveryPhase: "idle" as const };
    const view = render(<LiveLessonExperience {...common} session={session} />);
    const provider = screen.getByTestId("livekit-room");
    expect(screen.getByTestId("video-stage")).toHaveAttribute("data-mode", "tabletFloating");
    expect(screen.getByTestId("lesson-workspace")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "start share" }));
    expect(screen.getByTestId("video-stage")).toHaveAttribute("data-mode", "focusOnly");
    expect(screen.getByTestId("livekit-room")).toBe(provider);
    fireEvent.click(screen.getByRole("button", { name: "stop share" }));
    expect(screen.getByTestId("video-stage")).toHaveAttribute("data-mode", "tabletFloating");
    expect(screen.getByTestId("livekit-room")).toBe(provider);
    view.rerender(<LiveLessonExperience {...common} session={{ ...session, materialId: null }} />);
    expect(screen.getByTestId("video-stage")).toHaveAttribute("data-mode", "videoOnly");
    permissions.canManage = true;
    view.rerender(<LiveLessonExperience {...common} session={session} />);
    expect(screen.getByTestId("video-stage")).toHaveAttribute("data-mode", "lesson");
  });
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
        onMediaLifecycleChange={vi.fn()}
        onRetryMedia={vi.fn()}
        profile={{ name: "Teacher", username: "teacher" } as never}
        recoveryPhase="idle"
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
        onMediaLifecycleChange={vi.fn()}
        onRetryMedia={vi.fn()}
        profile={{ name: "Teacher", username: "teacher" } as never}
        recoveryPhase="idle"
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

  it("disposes only the media provider during recovery and exposes bounded retry and leave actions", () => {
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));
    const onLeave = vi.fn();
    const onRetryMedia = vi.fn();
    const session = classroomSession();
    const common = {
      materials: [],
      onAssignMaterial: vi.fn(),
      onComplete: vi.fn(),
      onLeave,
      onMediaLifecycleChange: vi.fn(),
      onRetryMedia,
      profile: { name: "Teacher", username: "teacher" } as never,
    };
    const view = render(<LiveLessonExperience {...common} recoveryPhase="idle" session={session} />);

    fireEvent.click(screen.getByRole("button", { name: "focus external activity" }));
    const originalProvider = screen.getByTestId("livekit-room");

    view.rerender(<LiveLessonExperience {...common} recoveryPhase="refreshing" session={session} />);
    expect(screen.queryByTestId("livekit-room")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("classroom.recovery.refreshing");
    expect(view.container.querySelector(".playsay-classroom-shell")).toHaveAttribute(
      "data-presentation-mode",
      "external-activity-focus",
    );

    const refreshed = { ...session, expiresAt: "2026-07-20T11:30:00Z", token: "fresh-token" };
    view.rerender(<LiveLessonExperience {...common} recoveryPhase="connecting" session={refreshed} />);
    expect(screen.getByTestId("livekit-room")).not.toBe(originalProvider);
    expect(view.container.querySelector(".playsay-classroom-shell")).toHaveAttribute(
      "data-presentation-mode",
      "external-activity-focus",
    );

    view.rerender(<LiveLessonExperience {...common} recoveryPhase="failed" session={refreshed} />);
    expect(document.body).not.toHaveTextContent("fresh-token");
    expect(document.body).not.toHaveTextContent("teacher-1");
    expect(document.body).not.toHaveTextContent("livekit.example.test");
    const retry = screen.getByRole("button", { name: "classroom.recovery.retry" });
    expect(retry).toHaveFocus();
    fireEvent.click(retry);
    fireEvent.click(screen.getByRole("button", { name: "classroom.recovery.leave" }));
    expect(onRetryMedia).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});

function classroomSession(): LessonRoomSession {
  return {
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
  };
}
