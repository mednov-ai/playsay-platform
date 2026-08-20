// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../../app/AppProviders";
import type { LessonMaterial, LessonMaterialInput, MeProfile } from "../../../shared/api/playsay";
import { i18n } from "../../../shared/i18n";
import { MaterialLibraryPanel } from "./MaterialLibraryPanel";

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

vi.mock("../../../shared/api/playsay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../shared/api/playsay")>()),
  fetchMaterialAssets: vi.fn().mockResolvedValue([]),
}));

describe("MaterialLibraryPanel focused editor", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  beforeAll(async () => i18n.changeLanguage("ru"));

  it("opens a blank focused editor and saves only after the first block is added", async () => {
    const onSave = vi.fn(async (input: LessonMaterialInput) => savedMaterial(input));

    renderPanel({ onSave });

    fireEvent.click(screen.getByRole("button", { name: "Новая" }));

    expect(screen.getByRole("heading", { name: "Начните с первого блока" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "Название" }), { target: { value: "Travel warm-up" } });
    fireEvent.click(screen.getByRole("button", { name: "Текст" }));

    expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Редактировать" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Текст" })).not.toBeInTheDocument();
  });

  it("inserts after the active block and exposes keyboard-accessible move controls", () => {
    const { container } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Новая" }));
    fireEvent.click(screen.getByRole("button", { name: "Текст" }));
    fireEvent.click(screen.getByRole("button", { name: "Видео" }));
    fireEvent.click(screen.getByRole("button", { name: "Картинка" }));

    let articles = Array.from(container.querySelectorAll("article.playsay-material-editor-block"));
    expect(articles).toHaveLength(3);
    expect(articles[1]).toHaveTextContent("Видео");
    expect(articles[2]).toHaveTextContent("Картинка");

    fireEvent.click(screen.getByRole("button", { name: "Поднять блок 3" }));

    articles = Array.from(container.querySelectorAll("article.playsay-material-editor-block"));
    expect(articles[1]).toHaveTextContent("Картинка");
    expect(articles[2]).toHaveTextContent("Видео");
  });

  it("warns before leaving a dirty card and saves with the keyboard shortcut", async () => {
    const onSave = vi.fn(async (input: LessonMaterialInput) => savedMaterial(input));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPanel({ onSave });

    fireEvent.click(screen.getByRole("button", { name: "Новая" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Название" }), { target: { value: "Speaking club" } });
    fireEvent.click(screen.getByRole("button", { name: "Говорение" }));
    fireEvent.click(screen.getByRole("button", { name: "Назад к карточкам" }));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Холст карточки")).toBeVisible();

    fireEvent.keyDown(document, { ctrlKey: true, key: "s" });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Редактировать" })).toBeVisible();
  });

  it("reports focused and dirty state and renders workspace navigation in the editor header", async () => {
    const onAuthoringStateChange = vi.fn();
    renderPanel({
      onAuthoringStateChange,
      workspaceNavigation: <button type="button">Разделы</button>,
    });

    fireEvent.click(screen.getByRole("button", { name: "Новая" }));
    expect(screen.getByRole("button", { name: "Разделы" })).toBeVisible();
    await waitFor(() => expect(onAuthoringStateChange).toHaveBeenCalledWith({ dirty: false, focused: true }));

    fireEvent.change(screen.getByRole("textbox", { name: "Название" }), { target: { value: "New card" } });
    await waitFor(() => expect(onAuthoringStateChange).toHaveBeenCalledWith({ dirty: true, focused: true }));
  });
});

function renderPanel({
  onSave = vi.fn(async (input: LessonMaterialInput) => savedMaterial(input)),
  onAuthoringStateChange,
  workspaceNavigation,
}: {
  onSave?: (input: LessonMaterialInput, materialId?: string) => Promise<LessonMaterial | null>;
  onAuthoringStateChange?: (state: { dirty: boolean; focused: boolean }) => void;
  workspaceNavigation?: ReactNode;
} = {}) {
  return render(
    <AppProviders>
      <MaterialLibraryPanel
        courses={[]}
        disabled={false}
        lessons={{}}
        loading={false}
        materials={[]}
        message={null}
        onArchive={vi.fn()}
        onDraft={vi.fn().mockResolvedValue(null)}
        onDraftFromUrl={vi.fn().mockResolvedValue(null)}
        onGenerateImages={vi.fn().mockResolvedValue(null)}
        onLinkLesson={vi.fn()}
        onRefresh={vi.fn()}
        onSave={onSave}
        onAuthoringStateChange={onAuthoringStateChange}
        onSuggestAcceptedAnswers={vi.fn().mockResolvedValue(null)}
        onUpdateAsset={vi.fn().mockResolvedValue(null)}
        profile={{
          email: "teacher@example.test",
          name: "Teacher",
          roles: ["TEACHER"],
          subject: "teacher-1",
          username: "teacher",
        } as MeProfile}
        workspaceNavigation={workspaceNavigation}
      />
    </AppProviders>,
  );
}

function savedMaterial(input: LessonMaterialInput): LessonMaterial {
  const now = "2026-07-18T12:00:00.000Z";
  return {
    ageBand: input.ageBand ?? null,
    blockCount: Array.isArray((input.document as { pages?: Array<{ blocks?: unknown[] }> } | null)?.pages)
      ? ((input.document as { pages: Array<{ blocks?: unknown[] }> }).pages[0]?.blocks?.length ?? 0)
      : 0,
    cefrLevel: input.cefrLevel ?? "A2",
    createdAt: now,
    description: input.description ?? null,
    document: input.document ?? {},
    estimatedDurationMin: input.estimatedDurationMin ?? null,
    id: "material-1",
    language: input.language ?? "en",
    ownerTeacherName: "Teacher",
    ownerTeacherSubject: "teacher-1",
    ownerTeacherUserId: null,
    scoringRubric: input.scoringRubric ?? {},
    skillTags: input.skillTags ?? [],
    sourceMeta: input.sourceMeta ?? {},
    status: input.status ?? "DRAFT",
    title: input.title,
    topicTags: input.topicTags ?? [],
    updatedAt: now,
    visibility: input.visibility ?? "PRIVATE",
  };
}
