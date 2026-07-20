// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../../app/AppProviders";
import type { ScheduledLesson } from "../../../shared/api/playsay";
import { i18n } from "../../../shared/i18n";
import { ClassroomPreJoin, normalizedMicrophoneLevel } from "./ClassroomPreJoin";

const livekitState = vi.hoisted(() => ({
  devices: {
    audioinput: [] as MediaDeviceInfo[],
    audiooutput: [] as MediaDeviceInfo[],
    videoinput: [] as MediaDeviceInfo[],
  },
  tracks: undefined as Array<{ kind: string; mediaStreamTrack: MediaStreamTrack }> | undefined,
  volume: 0,
}));

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size; },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
});

vi.mock("@livekit/components-react", () => ({
  useMediaDevices: ({ kind }: { kind: keyof typeof livekitState.devices }) => livekitState.devices[kind],
  usePersistentUserChoices: () => ({
    userChoices: {
      audioDeviceId: "default",
      audioEnabled: true,
      username: "",
      videoDeviceId: "default",
      videoEnabled: true,
    },
    saveAudioInputDeviceId: vi.fn(),
    saveAudioInputEnabled: vi.fn(),
    saveVideoInputDeviceId: vi.fn(),
    saveVideoInputEnabled: vi.fn(),
  }),
  usePreviewTracks: () => livekitState.tracks,
  useTrackVolume: () => livekitState.volume,
}));

afterEach(() => {
  cleanup();
  livekitState.devices.audioinput = [];
  livekitState.devices.audiooutput = [];
  livekitState.devices.videoinput = [];
  livekitState.tracks = undefined;
  livekitState.volume = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLMediaElement.prototype, "setSinkId");
});
beforeAll(async () => i18n.changeLanguage("ru"));

describe("normalizedMicrophoneLevel", () => {
  it("keeps ordinary speech below the maximum and clamps loud input", () => {
    expect(normalizedMicrophoneLevel(0)).toBe(0);
    expect(normalizedMicrophoneLevel(0.2)).toBeLessThan(20);
    expect(normalizedMicrophoneLevel(0.5)).toBeGreaterThanOrEqual(45);
    expect(normalizedMicrophoneLevel(1)).toBe(100);
    expect(normalizedMicrophoneLevel(Number.NaN)).toBe(0);
  });
});

describe("ClassroomPreJoin", () => {
  it("keeps lesson entry unavailable until the sound check is complete", () => {
    const onJoin = vi.fn().mockResolvedValue(undefined);
    render(
      <AppProviders>
        <ClassroomPreJoin
          joining={false}
          lesson={{
            courseTitle: "Starter",
            createdAt: "2026-07-17T09:00:00Z",
            id: "lesson-1",
            inheritTemplateMaterial: false,
            lessonTitle: "Speaking",
            participants: [],
            status: "IN_PROGRESS",
            type: "INDIVIDUAL",
            updatedAt: "2026-07-17T09:00:00Z",
            workMode: "SHARED",
          } as ScheduledLesson}
          message={null}
          onBack={vi.fn()}
          onJoin={onJoin}
        />
      </AppProviders>,
    );

    expect(screen.getByText("Шаг 1 из 2")).toBeInTheDocument();
    expect(screen.getByText("Сначала завершите проверку звука")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Войти в урок" })).toBeDisabled();
    expect(onJoin).not.toHaveBeenCalled();
  });

  it("records while held, plays on release, and confirms microphone plus speakers", async () => {
    const audioMocks = installAudioLoopbackMocks();
    const originalSinkDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "setSinkId");
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    livekitState.tracks = [{ kind: "audio", mediaStreamTrack: {} as MediaStreamTrack }];
    livekitState.devices.audioinput = [mediaDevice("default", "Built-in microphone", "audioinput")];
    livekitState.devices.audiooutput = [
      mediaDevice("default", "System output", "audiooutput"),
      mediaDevice("headphones", "Headphones", "audiooutput"),
    ];
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    const onJoin = vi.fn().mockResolvedValue(undefined);
    render(
      <AppProviders>
        <ClassroomPreJoin
          joining={false}
          lesson={{
            courseTitle: "Starter",
            createdAt: "2026-07-17T09:00:00Z",
            id: "lesson-loopback",
            inheritTemplateMaterial: false,
            lessonTitle: "Speaking",
            participants: [],
            status: "IN_PROGRESS",
            type: "INDIVIDUAL",
            updatedAt: "2026-07-17T09:00:00Z",
            workMode: "SHARED",
          } as ScheduledLesson}
          message={null}
          onBack={vi.fn()}
          onJoin={onJoin}
        />
      </AppProviders>,
    );

    expect(screen.getByText("Необязательно")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Устройство вывода"), { target: { value: "headphones" } });
    const recordButton = screen.getByRole("button", { name: "Удерживайте и говорите" });
    fireEvent.pointerDown(recordButton, { button: 0, pointerId: 1 });
    expect(screen.getAllByText("Идёт запись")).toHaveLength(2);
    now = 400;
    fireEvent.pointerUp(recordButton, { button: 0, pointerId: 1 });

    expect(await screen.findByText("Слышно ли вас в записи?")).toBeInTheDocument();
    expect(audioMocks.setSinkId).toHaveBeenCalledWith("headphones");
    expect(screen.getByText("Шаг 2 из 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Да, всё слышно" }));
    expect(screen.getByText("Звук проверен. Можно входить в урок.")).toBeInTheDocument();

    const joinButton = screen.getByRole("button", { name: "Войти в урок" });
    expect(joinButton).toBeEnabled();
    fireEvent.click(joinButton);
    expect(onJoin).toHaveBeenCalledTimes(1);
    expect(onJoin).toHaveBeenCalledWith(expect.objectContaining({ audioEnabled: true }));

    fireEvent.change(screen.getByLabelText("Микрофон"), { target: { value: "default" } });
    expect(screen.getByText("Удерживайте кнопку, скажите несколько слов и отпустите.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Войти в урок" })).toBeDisabled();

    if (originalSinkDescriptor) {
      Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", originalSinkDescriptor);
    } else {
      Reflect.deleteProperty(HTMLMediaElement.prototype, "setSinkId");
    }
  });

  it("rejects a recording shorter than 0.3 seconds without starting playback", async () => {
    const audioMocks = installAudioLoopbackMocks();
    livekitState.tracks = [{ kind: "audio", mediaStreamTrack: {} as MediaStreamTrack }];
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    render(
      <AppProviders>
        <ClassroomPreJoin
          joining={false}
          lesson={{
            courseTitle: "Starter",
            createdAt: "2026-07-17T09:00:00Z",
            id: "lesson-short",
            inheritTemplateMaterial: false,
            lessonTitle: "Speaking",
            participants: [],
            status: "IN_PROGRESS",
            type: "INDIVIDUAL",
            updatedAt: "2026-07-17T09:00:00Z",
            workMode: "SHARED",
          } as ScheduledLesson}
          message={null}
          onBack={vi.fn()}
          onJoin={vi.fn().mockResolvedValue(undefined)}
        />
      </AppProviders>,
    );

    const recordButton = screen.getByRole("button", { name: "Удерживайте и говорите" });
    fireEvent.keyDown(recordButton, { key: " ", repeat: false });
    now = 299;
    fireEvent.keyUp(recordButton, { key: " " });

    expect(await screen.findByText("Удерживайте кнопку чуть дольше")).toBeInTheDocument();
    expect(audioMocks.play).not.toHaveBeenCalled();
  });

  it("offers a one-click entry without sound only after a technical failure", async () => {
    const onJoin = vi.fn().mockResolvedValue(undefined);
    livekitState.tracks = [{ kind: "audio", mediaStreamTrack: {} as MediaStreamTrack }];

    render(
      <AppProviders>
        <ClassroomPreJoin
          joining={false}
          lesson={{
            courseTitle: "Starter",
            createdAt: "2026-07-17T09:00:00Z",
            id: "lesson-audio-error",
            inheritTemplateMaterial: false,
            lessonTitle: "Speaking",
            participants: [],
            status: "IN_PROGRESS",
            type: "INDIVIDUAL",
            updatedAt: "2026-07-17T09:00:00Z",
            workMode: "SHARED",
          } as ScheduledLesson}
          message={null}
          onBack={vi.fn()}
          onJoin={onJoin}
        />
      </AppProviders>,
    );

    expect(screen.queryByRole("button", { name: "Войти без звука" })).not.toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Удерживайте и говорите" }), { button: 0, pointerId: 1 });

    expect(await screen.findByText("Не удалось проверить звук")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Войти без звука" }));

    expect(onJoin).toHaveBeenCalledTimes(1);
    expect(onJoin).toHaveBeenCalledWith(expect.objectContaining({ audioEnabled: false }));
  });
});

function installAudioLoopbackMocks() {
  const play = vi.fn().mockResolvedValue(undefined);
  const setSinkId = vi.fn().mockResolvedValue(undefined);
  class FakeMediaStream {
    constructor(_tracks: MediaStreamTrack[]) {}
  }

  class FakeMediaRecorder {
    mimeType = "audio/webm";
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    onstop: (() => void) | null = null;
    state: RecordingState = "inactive";

    constructor(_stream: MediaStream) {}

    start() {
      this.state = "recording";
    }

    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["voice"], { type: this.mimeType }) } as BlobEvent);
      this.onstop?.();
    }
  }

  class FakeAudio {
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(_url: string) {}

    load() {}
    pause() {}
    removeAttribute(_name: string) {}
    play() {
      void play();
      queueMicrotask(() => this.onended?.());
      return Promise.resolve();
    }
    setSinkId(deviceId: string) {
      return setSinkId(deviceId);
    }
  }

  const NativeUrl = URL;
  class FakeUrl extends NativeUrl {
    static createObjectURL() { return "blob:loopback"; }
    static revokeObjectURL(_url: string) {}
  }

  vi.stubGlobal("MediaStream", FakeMediaStream);
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("URL", FakeUrl);
  return { play, setSinkId };
}

function mediaDevice(deviceId: string, label: string, kind: MediaDeviceKind): MediaDeviceInfo {
  return { deviceId, groupId: "", kind, label, toJSON: () => ({}) };
}
