// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../app/AppProviders";
import { workspaceTabsForProfile } from "../../entities/workspace/model";
import { i18n } from "../../shared/i18n";
import { WorkspaceTabs } from "./WorkspaceTabs";

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

const teacherProfile = {
  email: "teacher@example.test",
  name: "Teacher",
  roles: ["TEACHER"],
  subject: "teacher-1",
  username: "teacher",
};

describe("WorkspaceTabs", () => {
  beforeAll(async () => i18n.changeLanguage("ru"));
  afterEach(cleanup);

  it("keeps the section cards collapsed until the switcher is opened", () => {
    renderSwitcher();

    expect(screen.getByText("Уроки")).toBeVisible();
    expect(screen.getByText("расписание и подготовка")).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "Разделы Play&Say" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Все разделы" }));

    expect(screen.getByRole("dialog", { name: "Разделы Play&Say" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Материалы/ })).toBeVisible();
  });

  it("selects a section, closes the menu and supports Escape", () => {
    const onSelect = vi.fn();
    renderSwitcher(onSelect);
    const trigger = screen.getByRole("button", { name: "Все разделы" });

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: /Материалы/ }));
    expect(onSelect).toHaveBeenCalledWith("materials");
    expect(screen.queryByRole("dialog", { name: "Разделы Play&Say" })).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Разделы Play&Say" })).not.toBeInTheDocument();
  });
});

function renderSwitcher(onSelect = vi.fn()) {
  return render(
    <AppProviders>
      <WorkspaceTabs
        activeTab="schedule"
        onSelect={onSelect}
        tabs={workspaceTabsForProfile(teacherProfile)}
      />
    </AppProviders>,
  );
}
