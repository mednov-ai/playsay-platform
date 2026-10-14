// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../../app/AppProviders";
import { localScheduleValues } from "../../../entities/schedule/model";
import type { AdminUserProfile } from "../../../shared/api/playsay";
import { i18n } from "../../../shared/i18n";
import { ScheduleCreateForm } from "./ScheduleCreateForm";

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) },
  });
});

beforeAll(async () => i18n.changeLanguage("ru"));
afterEach(() => { cleanup(); vi.useRealTimers(); });

function setup() {
  const onCreate = vi.fn();
  const view = render(<AppProviders><ScheduleCreateForm disabled={false} lessonOptions={[]} materials={[]}
    onCreate={onCreate} studentUsers={[{ subject: "student-1", displayName: "Test Student" }] as AdminUserProfile[]} /></AppProviders>);
  fireEvent.click(view.container.querySelector('[data-schedule-student-picker-open="true"]')!);
  fireEvent.click(screen.getByRole("checkbox", { name: /Test Student/ }));
  fireEvent.click(screen.getByRole("button", { name: "Применить" }));
  return { ...view, onCreate, form: view.container.querySelector("form")! };
}

function selectStart(container: HTMLElement, start: string) {
  const { date, time } = localScheduleValues(start);
  fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: date } });
  fireEvent.change(container.querySelector('input[type="time"]')!, { target: { value: time } });
}

describe("ScheduleCreateForm native validation", () => {
  it.each([0, 1, 5, 10, 30, 1440])("submits a 45-minute lesson %i minutes from the current minute", (offset) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-13T12:07:37Z"));
    const { container, form, onCreate } = setup();
    const start = new Date(Date.parse("2026-10-13T12:07:00Z") + offset * 60_000).toISOString();
    selectStart(container, start);
    expect(form.checkValidity()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Создать урок" }));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ scheduledStart: start,
      scheduledEnd: new Date(Date.parse(start) + 45 * 60_000).toISOString(), status: "SCHEDULED", participantSubjects: ["student-1"] }));
  });

  it("accepts the 45-minute preset and ten-minute steppers without blocking native submission", () => {
    const { container, form, onCreate } = setup();
    fireEvent.click(screen.getByText("45", { selector: "button" }));
    expect(form.checkValidity()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Уменьшить длительность на 10 минут" }));
    expect(container.querySelector('input[name="durationMinutes"]')).toHaveValue(35);
    expect(form.checkValidity()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Увеличить длительность на 10 минут" }));
    fireEvent.click(screen.getByRole("button", { name: "Увеличить длительность на 10 минут" }));
    expect(container.querySelector('input[name="durationMinutes"]')).toHaveValue(55);
    expect(form.checkValidity()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Создать урок" }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("keeps a valid future 30-minute lesson as the control case", () => {
    const { container, form, onCreate } = setup();
    selectStart(container, "2026-10-14T12:07:00Z");
    fireEvent.click(screen.getByText("30", { selector: "button" }));
    expect(form.checkValidity()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Создать урок" }));
    expect(onCreate).toHaveBeenCalledOnce();
  });
});
