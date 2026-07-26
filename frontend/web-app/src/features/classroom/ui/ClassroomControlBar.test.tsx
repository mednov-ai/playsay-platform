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
  canPlayAudio: true,
  canPlayVideo: true,
  captureOptions: undefined as unknown,
  room: {
    localParticipant: {
      isScreenShareEnabled: false,
    },
  },
  saveAudioInputEnabled: vi.fn(),
  saveVideoInputEnabled: vi.fn(),
  toggle: vi.fn(),
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
  useTracks: () => mocks.audioTracks,
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
  getBrowser: () => ({ name: mocks.browserName }),
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
      "classroom.controls.microphone": "Микрофон",
      "classroom.controls.camera": "Камера",
      "classroom.controls.screenAudioMissing": "Экран передаётся без звука.",
      "classroom.controls.screenAudioMissingSafari": "Safari не передаёт звук демонстрации.",
      "classroom.controls.startMedia": "Включить медиа",
    })[key] ?? key,
  }),
}));

afterEach(() => cleanup());

beforeEach(() => {
  mocks.audioTracks = [];
  mocks.browserName = "Safari";
  mocks.canPlayAudio = true;
  mocks.canPlayVideo = true;
  mocks.captureOptions = undefined;
  mocks.room.localParticipant.isScreenShareEnabled = false;
  mocks.saveAudioInputEnabled.mockReset();
  mocks.saveVideoInputEnabled.mockReset();
  mocks.toggle.mockReset();
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
});

describe("ClassroomControlBar screen sharing", () => {
  it("requests display audio and own-audio restriction from LiveKit", () => {
    renderControlBar();

    expect(mocks.captureOptions).toEqual(classroomScreenShareCaptureOptions);
    expect(classroomScreenShareCaptureOptions).toEqual({
      audio: { restrictOwnAudio: true },
      systemAudio: "include",
    });
  });

  it("shows a Safari warning for video-only sharing and hides it when audio is published or sharing stops", async () => {
    const view = renderControlBar();

    fireEvent.click(screen.getByRole("button", { name: "Экран" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Safari не передаёт звук демонстрации.");

    mocks.audioTracks = [{
      participant: mocks.room.localParticipant,
      publication: { track: {} },
    }];
    view.rerender(controlBar());
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());

    mocks.audioTracks = [];
    fireEvent.click(screen.getByRole("button", { name: "Экран" }));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("shows the generic warning for video-only sharing outside Safari", async () => {
    mocks.browserName = "Chrome";
    renderControlBar();

    fireEvent.click(screen.getByRole("button", { name: "Экран" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Экран передаётся без звука.");
  });

  it("selects the generic warning outside Safari", () => {
    expect(classroomScreenShareAudioWarning(true, false, "Chrome")).toBe("missing");
    expect(classroomScreenShareAudioWarning(true, false, "Safari")).toBe("safari");
    expect(classroomScreenShareAudioWarning(true, true, "Safari")).toBeNull();
    expect(classroomScreenShareAudioWarning(false, false, "Chrome")).toBeNull();
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
