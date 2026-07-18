// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../../app/AppProviders";
import { i18n } from "../../../shared/i18n";
import { LessonTranslationPermissionControl } from "./LessonTranslationPermissionControl";

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

describe("LessonTranslationPermissionControl", () => {
  afterEach(cleanup);
  beforeAll(async () => i18n.changeLanguage("ru"));

  it("renders the explicit profile permission and saves its next value", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const onSaved = vi.fn();
    render(
      <AppProviders>
        <LessonTranslationPermissionControl
          allowed={false}
          onChange={onChange}
          onSaved={onSaved}
          studentName="Student One"
        />
      </AppProviders>,
    );

    const checkbox = screen.getByRole("checkbox", { name: "Разрешить голосовой перевод для Student One" });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(true));
    expect(checkbox).toBeChecked();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("rolls the checkbox back when the permission update fails", async () => {
    const onChange = vi.fn().mockRejectedValue(new Error("denied"));
    const onError = vi.fn();
    render(
      <AppProviders>
        <LessonTranslationPermissionControl
          allowed={false}
          onChange={onChange}
          onError={onError}
          studentName="Student One"
        />
      </AppProviders>,
    );

    const checkbox = screen.getByRole("checkbox", { name: "Разрешить голосовой перевод для Student One" });
    fireEvent.click(checkbox);

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(checkbox).not.toBeChecked();
  });
});
