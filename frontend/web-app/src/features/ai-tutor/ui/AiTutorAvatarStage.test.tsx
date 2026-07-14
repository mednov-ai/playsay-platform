// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }

import { renderToStaticMarkup } from "react-dom/server";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { TutorPersona } from "../../../shared/api/aiTutor";
import { i18n } from "../../../shared/i18n";
import { ActiveSession, DialogAllowanceCard, TeacherDialogAllowancesPanel, TutorPersonaPicker } from "./AiTutorPanel";
import { AiTutorAvatarStage, TutorPortrait } from "./AiTutorAvatarStage";

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

beforeAll(async () => {
  await i18n.changeLanguage("ru");
});

const personas: TutorPersona[] = [
  { id: "maya", name: "Maya", voice: "coral", accent: "GENERAL_AMERICAN", avatarAsset: "/avatars/maya.webp" },
  { id: "leo", name: "Leo", voice: "verse", accent: "STANDARD_BRITISH", avatarAsset: "/avatars/leo.webp" },
  { id: "nova", name: "Nova", voice: "sage", accent: "GENERAL_AMERICAN", avatarAsset: "/avatars/nova.webp" },
];

describe("AI tutor portraits", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders the selected persona asset in the large stage", () => {
    const markup = renderToStaticMarkup(<AiTutorAvatarStage activity="speaking" audioStream={null} persona={personas[1]} />);

    expect(markup).toContain('data-persona-id="leo"');
    expect(markup).toContain('data-speaking="true"');
    expect(markup).toContain('data-testid="ai-tutor-avatar-image"');
    expect(markup).toContain('src="/avatars/leo.webp"');
    expect(markup).toContain('src="/avatars/animated/leo/blink.webp"');
    expect(markup).toContain('src="/avatars/animated/leo/blink-half.webp"');
    expect(markup).toContain('data-avatar-layer="blink-half"');
    expect(markup).toContain('data-avatar-layer="blink-closed"');
    expect(markup).toContain('src="/avatars/animated/leo/mouth-wide.webp"');
    expect(markup).not.toContain('/avatars/animated/maya/');
    expect(markup).not.toContain('/avatars/animated/nova/');
  });

  it("keeps an unknown persona static", () => {
    const markup = renderToStaticMarkup(<AiTutorAvatarStage activity="idle" audioStream={null} persona={{ ...personas[0], id: "guest" }} />);

    expect(markup).toContain('src="/avatars/maya.webp"');
    expect(markup).not.toContain('/avatars/animated/');
  });

  it("does not load animation layers when reduced motion is requested", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({
        addEventListener: vi.fn(),
        matches: true,
        removeEventListener: vi.fn(),
      }),
    });
    const markup = renderToStaticMarkup(<AiTutorAvatarStage activity="speaking" audioStream={null} persona={personas[0]} />);

    expect(markup).toContain('data-reduced-motion="true"');
    expect(markup).not.toContain('/avatars/animated/');
    expect(markup).toContain('data-speaking="true"');
  });

  it("renders a stable initial fallback when an asset is unavailable", () => {
    const markup = renderToStaticMarkup(
      <TutorPortrait
        className="portrait"
        persona={{ ...personas[2], avatarAsset: "" }}
      />,
    );

    expect(markup).toContain('data-avatar-fallback="true"');
    expect(markup).toContain(">N</span>");
    expect(markup).not.toContain("<img");
  });

  it("renders native radio cards and localized accent labels", () => {
    const markup = renderToStaticMarkup(
      <TutorPersonaPicker
        disabled={false}
        onPersonaChange={() => undefined}
        personaId="leo"
        personas={personas}
      />,
    );

    expect(markup).toContain('name="ai-tutor-persona"');
    expect(markup).toMatch(/name="ai-tutor-persona"[^>]*checked=""[^>]*value="leo"/);
    expect(markup).toContain("Американский английский");
    expect(markup).toContain("Британский английский");
    expect(markup).not.toContain("GENERAL_AMERICAN");
    expect(markup).not.toContain("STANDARD_BRITISH");
  });

  it("renders available and exhausted dialog allowance states", () => {
    const available = renderToStaticMarkup(
      <DialogAllowanceCard allowance={{ limited: true, remainingDialogs: 1, canStart: true, maxDurationSeconds: 600, nextAction: "NONE" }} />,
    );
    const exhausted = renderToStaticMarkup(
      <DialogAllowanceCard allowance={{ limited: true, remainingDialogs: 0, canStart: false, maxDurationSeconds: 600, nextAction: "CONTACT_TEACHER", teacherDisplayName: "Maya" }} />,
    );

    expect(available).toContain("Доступно диалогов: 1");
    expect(available).toContain("10 минут");
    expect(exhausted).toContain("Доступные диалоги закончились");
    expect(exhausted).toContain("Maya");
  });

  it("explains why start is unavailable while another dialog is active", () => {
    const markup = renderToStaticMarkup(
      <DialogAllowanceCard allowance={{ limited: true, remainingDialogs: 2, canStart: false, maxDurationSeconds: 600, nextAction: "NONE" }} />,
    );

    expect(markup).toContain("Диалог уже запущен");
    expect(markup).toContain("Завершите его");
  });

  it("lets a teacher choose a preset and explicitly add dialogs", () => {
    const onGrant = vi.fn().mockResolvedValue(undefined);
    render(
      <TeacherDialogAllowancesPanel
        allowances={[{ studentUserId: "student-id", studentSubject: "student-subject", displayName: "Alex", remainingDialogs: 1 }]}
        grantingStudentId={null}
        loading={false}
        message={null}
        onGrant={onGrant}
        onRefresh={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "+5" }));
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));

    expect(onGrant).toHaveBeenCalledWith("student-id", 5);
  });

  it("finishes a dialog once when the absolute server deadline is reached", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T12:00:00.000Z"));
    const onFinish = vi.fn();
    render(
      <ActiveSession
        evaluation={null}
        expiresAt="2026-07-14T12:00:02.000Z"
        feedbackMode="SIGNIFICANT"
        loading={false}
        onClearEvaluation={() => undefined}
        onFinish={onFinish}
        onRepeat={() => undefined}
      />,
    );

    expect(screen.getByTestId("ai-tutor-dialog-countdown")).toHaveTextContent("0:02");
    act(() => vi.advanceTimersByTime(2_000));
    expect(onFinish).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(5_000));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
