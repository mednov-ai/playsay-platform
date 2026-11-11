// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { changeAppLanguage } from "../../../shared/i18n";
import { ParallelTeacherWorkspace } from "./ParallelTeacherWorkspace";

vi.mock("../../../shared/api/playsay", () => ({ fetchUnallocatedParallelMaterialAnnotations: vi.fn().mockResolvedValue(null), fetchUnallocatedParallelAnnotationSnapshots: vi.fn().mockResolvedValue({ items: [], hasNext: false }) }));
vi.mock("./StudentLiveWorkspace", () => ({ StudentLiveWorkspace: () => <div>student</div> }));
vi.mock("./LessonTaskCanvas", () => ({ LessonTaskCanvas: () => <div>archive</div> }));
const props = { canViewUnallocated: true, displayName: "Teacher", lessonId: "lesson", material: { id: "material" },
  onSaveAnswers: vi.fn(), score: null, submission: null, submissionMessage: null, submissionSaving: false,
  teacherName: "Teacher", teacherSubject: "teacher" } as unknown as ComponentProps<typeof ParallelTeacherWorkspace>;
afterEach(cleanup);

describe("unallocated annotations localization", () => {
  it.each([
    ["ru", "Нераспределённые штрихи", "Нераспределённых штрихов нет."],
    ["en", "Unallocated annotations", "There are no unallocated annotations."],
    ["de", "Nicht zugeordnete Anmerkungen", "Es gibt keine nicht zugeordneten Anmerkungen."],
    ["fr", "Annotations non attribuées", "Il n’y a aucune annotation non attribuée."],
  ])("renders the action and empty state in %s", async (language, open, empty) => {
    await changeAppLanguage(language);
    render(<ParallelTeacherWorkspace {...props} />);
    fireEvent.click(screen.getByRole("button", { name: open }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(empty));
    expect(screen.queryByText("classroom.unallocatedAnnotations.empty")).toBeNull();
  });
});
