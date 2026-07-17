// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../../app/AppProviders";
import type { ScheduledLesson } from "../../../shared/api/playsay";
import { i18n } from "../../../shared/i18n";
import { ClassroomPreJoin, preJoinWarnings } from "./ClassroomPreJoin";

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
  useMediaDevices: () => [],
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
  usePreviewTracks: () => undefined,
  useTrackVolume: () => 0,
}));

afterEach(cleanup);
beforeAll(async () => i18n.changeLanguage("ru"));

describe("preJoinWarnings", () => {
  it("allows a fully checked setup without warnings", () => {
    expect(preJoinWarnings({ cameraReady: true, microphoneReady: true, speakerReady: true })).toEqual([]);
  });

  it("reports every incomplete device check in priority order", () => {
    expect(preJoinWarnings({ cameraReady: false, microphoneReady: false, speakerReady: false })).toEqual([
      "microphone",
      "speaker",
      "camera",
    ]);
  });

  it("does not require the camera when the caller marks it optional", () => {
    expect(preJoinWarnings({ cameraReady: true, microphoneReady: false, speakerReady: true })).toEqual(["microphone"]);
  });
});

describe("ClassroomPreJoin", () => {
  it("requires a second explicit click when device checks are incomplete", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Войти в урок" }));
    expect(await screen.findByText("Не все проверки завершены")).toBeInTheDocument();
    expect(onJoin).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Всё равно войти" }));
    expect(onJoin).toHaveBeenCalledWith(expect.objectContaining({
      audioDeviceId: "default",
      videoDeviceId: "default",
    }));
  });
});
