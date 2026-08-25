// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../../../shared/i18n";
import { resources } from "../../../../shared/i18n/resources";
import type { MaterialExternalActivitySync } from "../../model/materialDocument";
import {
  ExternalActivityFrame,
  externalActivityContentRect,
  externalActivityPoint,
  shouldSendExternalActivityPointerInput,
} from "./ExternalActivityFrame";

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

const block = {
  id: "external-1",
  type: "externalActivity" as const,
  title: "Wordwall",
  url: "https://wordwall.net/resource/1",
};

function sync(overrides: Partial<MaterialExternalActivitySync> = {}): MaterialExternalActivitySync {
  return {
    active: {
      blockId: block.id,
      sessionId: "s-1",
      hostIdentity: "teacher",
      phase: "AWAITING_ACTION",
      studentsLocked: false,
      visible: true,
    },
    cursors: [],
    isHost: true,
    mediaStream: null,
    open: vi.fn(),
    reload: vi.fn(),
    retry: vi.fn(),
    returnToLesson: vi.fn(),
    sendCursor: vi.fn(),
    sendInput: vi.fn(),
    ...overrides,
  };
}

describe("ExternalActivityFrame", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ru");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("positions remote cursors inside the same contain-fitted video rectangle as input", () => {
    expect(externalActivityContentRect({
      surfaceHeight: 900,
      surfaceWidth: 1440,
      videoHeight: 900,
      videoWidth: 1080,
    })).toEqual({
      height: 900,
      left: 180,
      top: 0,
      width: 1080,
    });

    expect(externalActivityContentRect({
      surfaceHeight: 900,
      surfaceWidth: 1440,
      videoHeight: 720,
      videoWidth: 1280,
    })).toEqual({
      height: 810,
      left: 0,
      top: 45,
      width: 1440,
    });
  });

  it("maps input against the visible contain-fitted video instead of its letterbox", () => {
    expect(externalActivityPoint({
      clientX: 180,
      clientY: 450,
      surface: { height: 900, left: 0, top: 0, width: 1440 },
      videoHeight: 900,
      videoWidth: 1080,
    })).toEqual({
      normalizedX: 0,
      normalizedY: 0.5,
      sourceHeight: 900,
      sourceWidth: 1080,
      x: 0,
      y: 450,
    });

    expect(externalActivityPoint({
      clientX: 720,
      clientY: 450,
      surface: { height: 900, left: 0, top: 0, width: 1440 },
      videoHeight: 900,
      videoWidth: 1080,
    })).toEqual({
      normalizedX: 0.5,
      normalizedY: 0.5,
      sourceHeight: 900,
      sourceWidth: 1080,
      x: 540,
      y: 450,
    });
  });

  it("keeps participant cursor movement separate from provider pointer input", () => {
    expect(shouldSendExternalActivityPointerInput("move")).toBe(false);
    expect(shouldSendExternalActivityPointerInput("down")).toBe(true);
    expect(shouldSendExternalActivityPointerInput("up")).toBe(true);
  });

  it("coalesces wheel input into one summed event per animation frame", () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrames.push(callback);
      return 17;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 720,
      height: 720,
      left: 0,
      right: 1280,
      top: 0,
      width: 1280,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const sendInput = vi.fn();
    render(<ExternalActivityFrame block={block} sync={sync({ sendInput })} />);
    const surface = screen.getByRole("application");

    fireEvent.wheel(surface, { clientX: 640, clientY: 360, deltaX: 2, deltaY: 10 });
    fireEvent.wheel(surface, { clientX: 640, clientY: 360, deltaX: 3, deltaY: 15 });

    expect(sendInput).not.toHaveBeenCalled();
    animationFrames[0]?.(16);
    expect(sendInput).toHaveBeenCalledTimes(1);
    expect(sendInput).toHaveBeenCalledWith(expect.objectContaining({
      deltaX: 5,
      deltaY: 25,
      type: "scroll",
    }));
  });

  it("confirms extension detection before asking the teacher for the browser action", () => {
    render(<ExternalActivityFrame block={block} sync={sync()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Расширение найдено");
    expect(screen.getByRole("status")).toHaveTextContent("значок с пчёлкой");
    expect(screen.getByRole("button", { name: "Вернуться к уроку" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Обновить" })).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it.each([
    ["OPENING_PROVIDER", "Открываем задание и проверяем расширение"],
    ["STARTING", "Запускаем показ задания"],
  ] as const)("renders the teacher %s lifecycle state", (phase, expected) => {
    render(<ExternalActivityFrame block={block} sync={sync({
      active: {
        blockId: block.id,
        sessionId: "s-1",
        hostIdentity: "teacher",
        phase,
        studentsLocked: false,
        visible: true,
      },
    })} />);

    expect(screen.getByRole("status")).toHaveTextContent(expected);
    expect(screen.getByRole("button", { name: "Вернуться к уроку" })).toBeEnabled();
  });

  it("renders active sharing without covering the interaction surface", () => {
    render(<ExternalActivityFrame block={block} sync={sync({
      active: {
        blockId: block.id,
        sessionId: "s-1",
        hostIdentity: "teacher",
        phase: "ACTIVE",
        studentsLocked: false,
        visible: true,
      },
    })} />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Обновить" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Вернуться к уроку" })).toBeEnabled();
  });

  it("uses generic waiting copy for a participant request", () => {
    render(<ExternalActivityFrame block={block} sync={sync({
      active: {
        blockId: block.id,
        sessionId: "s-1",
        hostIdentity: null,
        phase: "REQUESTED",
        studentsLocked: false,
        visible: true,
      },
      isHost: false,
    })} />);

    expect(screen.getByRole("status")).toHaveTextContent("Ждём, когда учитель поделится заданием");
    expect(screen.queryByText(/расширен/i)).toBeNull();
  });

  it("shows a distinct participant status while the active media track is connecting", () => {
    render(<ExternalActivityFrame block={block} sync={sync({
      active: {
        blockId: block.id,
        sessionId: "s-1",
        hostIdentity: "teacher",
        phase: "ACTIVE",
        studentsLocked: false,
        visible: true,
      },
      isHost: false,
      mediaStream: null,
    })} />);

    expect(screen.getByRole("status")).toHaveTextContent("Подключаем показ задания");
    expect(screen.getByRole("status")).toHaveTextContent("несколько секунд");
  });

  it("shows a stable teacher diagnostic and focuses the retry action", () => {
    const retry = vi.fn();
    render(<ExternalActivityFrame block={block} sync={sync({
      active: {
        blockId: block.id,
        sessionId: "s-1",
        hostIdentity: "teacher",
        phase: "ERROR",
        studentsLocked: false,
        errorCode: "EXTENSION_NOT_DETECTED",
        visible: true,
      },
      retry,
    })} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("EXTENSION_NOT_DETECTED");
    expect(alert).toHaveTextContent("chrome://extensions");
    const retryButton = screen.getByRole("button", { name: "Повторить" });
    expect(retryButton).toHaveFocus();
    fireEvent.click(retryButton);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows the required extension version for a trusted-input update", () => {
    render(<ExternalActivityFrame block={block} sync={sync({
      active: {
        blockId: block.id,
        sessionId: "s-1",
        hostIdentity: "teacher",
        phase: "ERROR",
        studentsLocked: false,
        errorCode: "EXTENSION_UPDATE_REQUIRED",
        visible: true,
      },
    })} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("EXTENSION_UPDATE_REQUIRED");
    expect(alert).toHaveTextContent("0.1.7");
  });

  it("keeps teacher-only diagnostics out of the student failure state", () => {
    const returnToLesson = vi.fn();
    render(<ExternalActivityFrame block={block} sync={sync({
      active: {
        blockId: block.id,
        sessionId: "s-1",
        hostIdentity: "teacher",
        phase: "ERROR",
        studentsLocked: false,
        errorCode: "CAPTURE_PERMISSION_DENIED",
        visible: true,
      },
      isHost: false,
      returnToLesson,
    })} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Показ задания пока недоступен");
    expect(alert).not.toHaveTextContent("CAPTURE_PERMISSION_DENIED");
    expect(screen.queryByRole("button", { name: "Повторить" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Вернуться к уроку" }));
    expect(returnToLesson).toHaveBeenCalledTimes(1);
  });

  it.each(["ru", "en", "de", "fr"] as const)("renders localized error status in %s", async (language) => {
    await i18n.changeLanguage(language);
    render(<ExternalActivityFrame block={block} sync={sync({
      active: {
        blockId: block.id,
        sessionId: "s-1",
        hostIdentity: "teacher",
        phase: "ERROR",
        studentsLocked: false,
        errorCode: "CAPTURE_NOT_SUPPORTED",
        visible: true,
      },
    })} />);

    const copy = resources[language].translation.materials.externalActivity;
    expect(screen.getByRole("alert")).toHaveTextContent(copy.error);
    expect(screen.getByRole("alert")).toHaveTextContent(copy.errors.captureNotSupported);
    expect(screen.getByRole("button", { name: copy.retry })).toBeEnabled();
  });

  it("mutes the local teacher preview but plays captured page audio for students", () => {
    const block = { id: "external-1", type: "externalActivity" as const, title: "Wordwall", url: "https://wordwall.net/resource/1" };
    const sync = {
      active: { blockId: "external-1", sessionId: "s-1", hostIdentity: "teacher", phase: "ACTIVE" as const, studentsLocked: false, visible: true },
      cursors: [], mediaStream: null, open: vi.fn(), reload: vi.fn(), retry: vi.fn(), returnToLesson: vi.fn(),
      sendCursor: vi.fn(), sendInput: vi.fn(),
    };

    const teacherMarkup = renderToStaticMarkup(<ExternalActivityFrame block={block} sync={{ ...sync, isHost: true }} />);
    const studentMarkup = renderToStaticMarkup(<ExternalActivityFrame block={block} sync={{ ...sync, isHost: false }} />);

    expect(teacherMarkup).toMatch(/<video[^>]*muted=""/);
    expect(studentMarkup).not.toMatch(/<video[^>]*muted=""/);
  });
});
