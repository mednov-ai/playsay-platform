// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../../app/AppProviders";
import type { AdminUserProfile, LessonMaterial, ScheduledLessonInput } from "../../../shared/api/playsay";
import { i18n } from "../../../shared/i18n";
import { LessonAssignmentWizard } from "./LessonAssignmentWizard";

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

afterEach(cleanup);
beforeAll(async () => i18n.changeLanguage("ru"));

describe("LessonAssignmentWizard", () => {
  it("starts with a focused student step and exposes the four-step journey", () => {
    const markup = renderToStaticMarkup(
      <AppProviders>
        <LessonAssignmentWizard
          disabled={false}
          lessonOptions={[]}
          managedStudentMessage={null}
          materials={[]}
          onClose={() => undefined}
          onCreate={async () => null}
          onCreateManagedStudent={async () => null}
          onOpenMaterials={() => undefined}
          onPrepare={() => undefined}
          open
          studentUsers={[]}
        />
      </AppProviders>,
    );

    expect(markup).toContain("Назначить урок");
    expect(markup).toContain("Кого будем учить?");
    expect(markup).toContain("Ученики");
    expect(markup).toContain("Время");
    expect(markup).toContain("Материал");
    expect(markup).toContain("Проверка");
  });

  it("keeps template selection explicit and submits no material as an explicit choice", async () => {
    const onCreate = vi.fn(async (_input: ScheduledLessonInput) => null);
    render(
      <AppProviders>
        <LessonAssignmentWizard
          disabled={false}
          lessonOptions={[{ id: "template-1", label: "Starter · Hello", materialId: "material-1" }]}
          managedStudentMessage={null}
          materials={[{ id: "material-1", title: "Hello cards", status: "PUBLISHED", cefrLevel: "A1", blockCount: 4 }] as LessonMaterial[]}
          onClose={() => undefined}
          onCreate={onCreate}
          onCreateManagedStudent={async () => null}
          onOpenMaterials={() => undefined}
          onPrepare={() => undefined}
          open
          studentUsers={[{ subject: "student-1", username: "student.one", displayName: "Student One" }] as AdminUserProfile[]}
        />
      </AppProviders>,
    );

    fireEvent.click(screen.getByText("Открыть список учеников").closest("button")!);
    fireEvent.click(screen.getByRole("checkbox", { name: /Student One/ }));
    fireEvent.click(screen.getByRole("button", { name: "Применить" }));
    fireEvent.click(screen.getByRole("button", { name: /Дальше/ }));
    fireEvent.click(screen.getByRole("button", { name: /Дальше/ }));

    const noMaterial = screen.getByRole("button", { name: /Без материала/ });
    expect(noMaterial).toHaveAttribute("aria-pressed", "true");
    expect(noMaterial.closest(".playsay-schedule-material-option--single")).not.toBeNull();
    const templateSelect = screen.getByRole("combobox");
    expect(templateSelect).toHaveValue("");

    fireEvent.change(templateSelect, { target: { value: "template-1" } });
    expect(screen.getByRole("button", { name: /Hello cards/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(noMaterial);
    expect(noMaterial).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Дальше/ }));
    expect(screen.getByText("Без материала")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Назначить/ }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][0]).toMatchObject({
      lessonTemplateId: "template-1",
      materialId: null,
      inheritTemplateMaterial: false,
      participantSubjects: ["student-1"],
    });
  });
});
