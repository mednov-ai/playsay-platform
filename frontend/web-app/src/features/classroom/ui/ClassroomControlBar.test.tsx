// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonTranslationController } from "../hooks/useLessonTranslation";
import {
  ClassroomControlBar,
  classroomScreenShareAudioWarning,
  classroomScreenShareCaptureOptions,
} from "./ClassroomControlBar";

const mocks = vi.hoisted(() => ({
  audioTracks: [] as Array<{ participant: unknown; publication: { track?: unknown } }>,
  browserName: "Safari",
  browserOS: undefined as "macOS" | undefined,
  canPlayAudio: true,
  canPlayVideo: true,
  captureOptions: undefined as unknown,
  room: {
    localParticipant: {
      isScreenShareEnabled: false,
      setScreenShareEnabled: vi.fn(),
    },
  },
  saveAudioInputEnabled: vi.fn(),
  saveVideoInputEnabled: vi.fn(),
  toggle: vi.fn(),
  videoTracks: [] as Array<{
    participant: unknown;
    publication: { track?: { mediaStreamTrack: MediaStreamTrack } };
  }>,
}));

vi.mock("@livekit/components-react", () => ({
  TrackToggle: ({
    "aria-label": ariaLabel,
    children,
    onChange,
    source,
    title,
  }: {
    "aria-label"?: string;
    children?: ReactNode;
    onChange?: (enabled: boolean, userInitiated: boolean) => void;
    source: string;
    title?: string;
  }) => (
    <button
      aria-label={ariaLabel}
      data-lk-source={source}
      onClick={() => onChange?.(false, true)}
      title={title}
      type="button"
    >
      {children}
    </button>
  ),
  usePersistentUserChoices: () => ({
    saveAudioInputEnabled: mocks.saveAudioInputEnabled,
    saveVideoInputEnabled: mocks.saveVideoInputEnabled,
  }),
  useRoomContext: () => mocks.room,
  useStartAudio: ({ props }: { props: Record<string, unknown> }) => ({
    canPlayAudio: mocks.canPlayAudio,
    mergedProps: { ...props, className: "lk-start-audio-button" },
  }),
  useStartVideo: ({ props }: { props: Record<string, unknown> }) => ({
    canPlayVideo: mocks.canPlayVideo,
    mergedProps: props,
  }),
  useTracks: (sources: string[]) => sources.includes("screen_share_audio")
    ? mocks.audioTracks
    : mocks.videoTracks,
  useTrackToggle: (options: {
    "aria-label"?: string;
    captureOptions?: unknown;
    source: string;
    title?: string;
  }) => {
    mocks.captureOptions = options.captureOptions;
    return {
      buttonProps: {
        "aria-label": options["aria-label"],
        "aria-pressed": mocks.room.localParticipant.isScreenShareEnabled,
        "data-lk-enabled": mocks.room.localParticipant.isScreenShareEnabled,
        "data-lk-source": options.source,
        title: options.title,
        type: "button",
      },
      enabled: mocks.room.localParticipant.isScreenShareEnabled,
      pending: false,
      toggle: mocks.toggle,
      track: undefined,
    };
  },
}));

vi.mock("livekit-client", () => ({
  getBrowser: () => ({ name: mocks.browserName, os: mocks.browserOS }),
  Track: {
    Source: {
      Camera: "camera",
      Microphone: "microphone",
      ScreenShare: "screen_share",
      ScreenShareAudio: "screen_share_audio",
    },
  },
}));

vi.mock("../../../shared/i18n", () => ({
  useAppTranslation: () => ({
    t: (key: string) => ({
      "classroom.controls.screen": "Экран",
      "classroom.controls.screenStop": "Завершить демонстрацию",
      "classroom.controls.screenStarting": "Запуск демонстрации",
      "classroom.controls.screenStopping": "Завершение демонстрации",
      "classroom.controls.screenPickerHint": "Не выбирайте вкладку урока.",
      "classroom.controls.screenStopError": "Не удалось завершить демонстрацию.",
      "classroom.controls.microphone": "Микрофон",
      "classroom.controls.camera": "Камера",
      "classroom.controls.screenAudioMissing": "Экран передаётся без звука.",
      "classroom.controls.screenAudioMissingMacOS": "Chrome не получил системный звук.",
      "classroom.controls.screenAudioMissingSafari": "Safari не передаёт звук демонстрации.",
      "classroom.controls.screenReselect": "Перевыбрать со звуком",
      "classroom.controls.startMedia": "Включить медиа",
      "classroom.actions.leave": "Выйти",
      "classroom.actions.more": "Другие действия",
      "classroom.actions.completeLesson": "Завершить занятие",
      "classroom.confirm.complete": "Комната закроется для всех.",
    })[key] ?? key,
  }),
}));

afterEach(() => cleanup());

beforeEach(() => {
  mocks.audioTracks = [];
  mocks.browserName = "Safari";
  mocks.browserOS = undefined;
  mocks.canPlayAudio = true;
  mocks.canPlayVideo = true;
  mocks.captureOptions = undefined;
  mocks.room.localParticipant.isScreenShareEnabled = false;
  mocks.saveAudioInputEnabled.mockReset();
  mocks.saveVideoInputEnabled.mockReset();
  mocks.toggle.mockReset();
  mocks.videoTracks = [];
  mocks.room.localParticipant.setScreenShareEnabled.mockReset();
  mocks.room.localParticipant.setScreenShareEnabled.mockImplementation(async (enabled: boolean) => {
    mocks.room.localParticipant.isScreenShareEnabled = enabled;
    return enabled;
  });
  mocks.toggle.mockImplementation(async (enabled?: boolean) => {
    mocks.room.localParticipant.isScreenShareEnabled = Boolean(enabled);
    return enabled;
  });
});

describe("ClassroomControlBar compact controls", () => {
  it("renders accessible camera and microphone toggles without in-lesson device menus", () => {
    const view = renderControlBar();

    expect(screen.getByRole("button", { name: "Микрофон" })).toHaveAttribute("title", "Микрофон");
    expect(screen.getByRole("button", { name: "Камера" })).toHaveAttribute("title", "Камера");
    expect(view.container.querySelector(".playsay-device-control")).not.toBeInTheDocument();
    expect(view.container.querySelector(".lk-button-menu")).not.toBeInTheDocument();
  });

  it("keeps persisting user-initiated camera and microphone state changes", () => {
    renderControlBar();

    fireEvent.click(screen.getByRole("button", { name: "Микрофон" }));
    fireEvent.click(screen.getByRole("button", { name: "Камера" }));

    expect(mocks.saveAudioInputEnabled).toHaveBeenCalledWith(false);
    expect(mocks.saveVideoInputEnabled).toHaveBeenCalledWith(false);
  });

  it("renders blocked autoplay as the same compact accessible icon control", () => {
    mocks.canPlayAudio = false;
    renderControlBar();

    const startMedia = screen.getByRole("button", { name: "Включить медиа" });
    expect(startMedia).toHaveClass("lk-start-audio-button");
    expect(startMedia).toHaveStyle({ display: "inline-flex" });
    expect(startMedia.querySelector("svg")).toBeInTheDocument();
  });

  it("leaves only the current participant from the round hang-up control", () => {
    const onLeave = vi.fn();
    render(
      <ClassroomControlBar
        onLeave={onLeave}
        role={null}
        setControlsRef={vi.fn()}
        translation={{} as LessonTranslationController}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Выйти" }));
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it("shows completion only to an authorized teacher and requires explicit confirmation", () => {
    const onComplete = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(
      <ClassroomControlBar
        canCompleteLesson
        onComplete={onComplete}
        role="teacher"
        setControlsRef={vi.fn()}
        translation={{} as LessonTranslationController}
      />,
    );

    fireEvent.click(screen.getByText("Завершить занятие"));
    expect(confirm).toHaveBeenCalledWith("Комната закроется для всех.");
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Завершить занятие"));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("does not expose lesson completion without the teacher permission", () => {
    renderControlBar();
    expect(screen.queryByText("Завершить занятие")).not.toBeInTheDocument();
  });

  it("keeps only microphone, camera, and leave in external activity focus", () => {
    render(
      <ClassroomControlBar
        canCompleteLesson
        externalActivityFocus
        fullscreenLabel="На весь экран"
        role="teacher"
        setControlsRef={vi.fn()}
        translation={{ canEnable: true, localEnabled: false } as LessonTranslationController}
      />,
    );

    expect(screen.getByText("Микрофон")).toBeInTheDocument();
    expect(screen.getByText("Камера")).toBeInTheDocument();
    expect(screen.getByText("Выйти")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Экран" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "На весь экран" })).not.toBeInTheDocument();
    expect(screen.queryByText("Завершить занятие")).not.toBeInTheDocument();
  });
});

describe("ClassroomControlBar screen sharing", () => {
  it("requests standard display audio from LiveKit without filtering teacher computer audio", () => {
    renderControlBar();

    expect(mocks.captureOptions).toEqual(classroomScreenShareCaptureOptions);
    expect(classroomScreenShareCaptureOptions).toEqual({
      audio: true,
      preferCurrentTab: false,
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
      systemAudio: "include",
    });
  });

  it("shows a Safari warning for video-only sharing and hides it when audio is published or sharing stops", async () => {
    const view = renderControlBar();

    fireEvent.click(screen.getByRole("button", { name: "Экран" }));
    expect(await screen.findByText("Safari не передаёт звук демонстрации.")).toBeInTheDocument();

    mocks.audioTracks = [{
      participant: mocks.room.localParticipant,
      publication: { track: {} },
    }];
    view.rerender(controlBar());
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());

    mocks.audioTracks = [];
    fireEvent.click(screen.getByRole("button", { name: "Завершить демонстрацию" }));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("shows the generic warning for video-only sharing outside Safari", async () => {
    mocks.browserName = "Chrome";
    renderControlBar();

    fireEvent.click(screen.getByRole("button", { name: "Экран" }));

    expect(await screen.findByText("Экран передаётся без звука.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Перевыбрать со звуком" })).toBeInTheDocument();
  });

  it("selects an actionable macOS warning for full-screen Chrome capture", () => {
    expect(classroomScreenShareAudioWarning(true, false, "Chrome")).toBe("missing");
    expect(classroomScreenShareAudioWarning(true, false, "Chrome", "monitor", true)).toBe("macos-system");
    expect(classroomScreenShareAudioWarning(true, false, "Chrome", "browser", true)).toBe("missing");
    expect(classroomScreenShareAudioWarning(true, false, "Safari")).toBe("safari");
    expect(classroomScreenShareAudioWarning(true, true, "Safari")).toBeNull();
    expect(classroomScreenShareAudioWarning(false, false, "Chrome")).toBeNull();
  });

  it("stops current publications and opens the picker again from the no-audio action", async () => {
    mocks.browserName = "Chrome";
    mocks.browserOS = "macOS";
    mocks.room.localParticipant.isScreenShareEnabled = true;
    mocks.videoTracks = [{
      participant: mocks.room.localParticipant,
      publication: {
        track: {
          mediaStreamTrack: {
            addEventListener: vi.fn(),
            getSettings: () => ({ displaySurface: "monitor" }),
            removeEventListener: vi.fn(),
          } as unknown as MediaStreamTrack,
        },
      },
    }];
    renderControlBar();

    expect(await screen.findByText("Chrome не получил системный звук.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Перевыбрать со звуком" }));

    await waitFor(() => {
      expect(mocks.room.localParticipant.setScreenShareEnabled).toHaveBeenCalledWith(false);
      expect(mocks.toggle).toHaveBeenCalledWith(true);
    });
  });
});

function renderControlBar() {
  return render(controlBar());
}

function controlBar() {
  return (
    <ClassroomControlBar
      role={null}
      setControlsRef={vi.fn()}
      translation={{} as LessonTranslationController}
    />
  );
}
