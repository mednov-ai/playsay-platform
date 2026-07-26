// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../../app/AppProviders";
import type { HomeworkAssignment } from "../../../shared/api/playsay";
import { i18n } from "../../../shared/i18n";
import { HomeworkAssignmentList } from "./HomeworkAssignmentList";

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

const assignment = {
  id: "assignment-1",
  materialId: "material-1",
  materialTitle: "animals comp vs sup",
  title: "comparative vs superlative",
  type: "HOMEWORK",
  status: "ACTIVE",
  recipientCount: 1,
  submittedCount: 0,
  scoredCount: 0,
  createdAt: "2026-07-25T08:00:00.000Z",
  updatedAt: "2026-07-25T08:00:00.000Z",
  mySubmissionState: "DRAFT",
} satisfies HomeworkAssignment;

describe("HomeworkAssignmentList student cards", () => {
  beforeAll(async () => i18n.changeLanguage("ru"));
  afterEach(cleanup);

  it("shows the student's own state and an explicit action instead of teacher group progress", () => {
    const onSelect = vi.fn();
    render(
      <AppProviders>
        <HomeworkAssignmentList
          assignments={[assignment]}
          canManage={false}
          onSelectAssignment={onSelect}
          selectedAssignmentId={null}
        />
      </AppProviders>,
    );

    expect(screen.getByText("Черновик")).toBeInTheDocument();
    expect(screen.getByText("Продолжить")).toBeInTheDocument();
    expect(screen.queryByText("0/1 с оценкой")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /comparative vs superlative/i }));
    expect(onSelect).toHaveBeenCalledWith("assignment-1");
  });
});
