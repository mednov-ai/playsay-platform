// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LessonMaterial, ScheduledLesson } from "../../../shared/api/playsay";
import { TeacherLessonToolbar } from "./TeacherLessonToolbar";

const translations: Record<string, string> = {
  "classroom.actions.add": "Добавить",
  "classroom.actions.addHtmlGamePage": "Добавить HTML-игру",
  "classroom.actions.addImagePage": "Добавить картинку",
  "classroom.actions.assign": "Назначить",
  "classroom.actions.uploadingHtmlGamePage": "Загружаем игру",
  "classroom.actions.uploadingImagePage": "Загружаем",
  "classroom.material.pickerEmpty": "Материал не выбран",
  "classroom.material.pickerLabel": "Карточка урока",
  "classroom.teacherTask.targetLabel": "Зачёт ученику",
  "classroom.teacherToolbar.aria": "Панель учителя",
};

vi.mock("../../../shared/i18n", () => ({
  useAppTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

afterEach(() => cleanup());

describe("TeacherLessonToolbar", () => {
  it("shows a static student chip for one participant and keeps assignment primary", () => {
    renderToolbar();

    expect(screen.getByText("Мила")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Зачёт ученику" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Карточка урока" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Назначить" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В словарик" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить" })).toBeInTheDocument();
  });

  it("selects a student and material without changing the existing callbacks", () => {
    const onSelectMaterial = vi.fn();
    const onSelectStudent = vi.fn();
    const onAssignMaterial = vi.fn();
    renderToolbar({
      activeStudentSubject: "student-1",
      onAssignMaterial,
      onSelectMaterial,
      onSelectStudent,
      participants: [participant("student-1", "Мила"), participant("student-2", "Саша")],
      selectedMaterialId: "material-1",
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Зачёт ученику" }), {
      target: { value: "student-2" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Карточка урока" }), {
      target: { value: "material-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Назначить" }));

    expect(onSelectStudent).toHaveBeenCalledWith("student-2");
    expect(onSelectMaterial).toHaveBeenCalledWith("material-1");
    expect(onAssignMaterial).toHaveBeenCalledOnce();
  });

  it("supports menu focus, arrow keys, Escape and outside dismissal", () => {
    renderToolbar();
    const trigger = screen.getByRole("button", { name: "Добавить" });

    fireEvent.click(trigger);
    const imageAction = screen.getByRole("menuitem", { name: "Добавить картинку" });
    const htmlAction = screen.getByRole("menuitem", { name: "Добавить HTML-игру" });
    expect(imageAction).toHaveFocus();

    fireEvent.keyDown(imageAction, { key: "ArrowDown" });
    expect(htmlAction).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps accepted file types and forwards selected uploads", () => {
    const onUploadHtmlGamePage = vi.fn();
    const onUploadImagePage = vi.fn();
    const { container } = renderToolbar({ onUploadHtmlGamePage, onUploadImagePage });
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const imageInput = inputs[0]!;
    const htmlInput = inputs[1]!;
    const imageFile = new File(["image"], "lesson.webp", { type: "image/webp" });
    const htmlFile = new File(["<html></html>"], "game.html", { type: "text/html" });

    expect(imageInput).toHaveAttribute("accept", "image/jpeg,image/png,image/webp,image/svg+xml");
    expect(htmlInput).toHaveAttribute("accept", "text/html,.html");

    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    fireEvent.change(imageInput, { target: { files: [imageFile] } });
    expect(onUploadImagePage).toHaveBeenCalledWith(imageFile);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    fireEvent.change(htmlInput, { target: { files: [htmlFile] } });
    expect(onUploadHtmlGamePage).toHaveBeenCalledWith(htmlFile);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps parallel-work supervision compact without shared-material actions", () => {
    renderToolbar({
      canManageMaterial: false,
      participants: [participant("student-1", "Мила"), participant("student-2", "Саша")],
    });

    expect(screen.getByRole("combobox", { name: "Зачёт ученику" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В словарик" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Карточка урока" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Добавить" })).not.toBeInTheDocument();
  });

  it("exposes busy states without enabling conflicting actions", () => {
    renderToolbar({
      assigningMaterial: true,
      uploadingHtmlGamePage: true,
      uploadingImagePage: true,
    });

    expect(screen.getByRole("combobox", { name: "Карточка урока" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Назначить" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    expect(screen.getByRole("menuitem", { name: "Загружаем" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Загружаем игру" })).toBeDisabled();
  });
});

function renderToolbar(overrides: Partial<Parameters<typeof TeacherLessonToolbar>[0]> = {}) {
  const props: Parameters<typeof TeacherLessonToolbar>[0] = {
    activeStudentSubject: "student-1",
    assigningMaterial: false,
    canManageMaterial: true,
    currentMaterialId: null,
    materials: [material("material-1", "Present Simple")],
    onAssignMaterial: vi.fn(),
    onSelectMaterial: vi.fn(),
    onSelectStudent: vi.fn(),
    onUploadHtmlGamePage: vi.fn(),
    onUploadImagePage: vi.fn(),
    participants: [participant("student-1", "Мила")],
    selectedMaterialId: "",
    uploadingHtmlGamePage: false,
    uploadingImagePage: false,
    vocabularyAction: <button aria-label="В словарик" type="button">В словарик</button>,
    ...overrides,
  };

  return render(<TeacherLessonToolbar {...props} />);
}

function participant(subject: string, displayName: string): ScheduledLesson["participants"][number] {
  return {
    displayName,
    subject,
  };
}

function material(id: string, title: string): LessonMaterial {
  return {
    blockCount: 1,
    cefrLevel: "A1",
    createdAt: "2026-07-26T10:00:00Z",
    document: {},
    id,
    language: "en",
    scoringRubric: {},
    sourceMeta: {},
    status: "PUBLISHED",
    title,
    updatedAt: "2026-07-26T10:00:00Z",
    visibility: "PRIVATE",
  };
}
