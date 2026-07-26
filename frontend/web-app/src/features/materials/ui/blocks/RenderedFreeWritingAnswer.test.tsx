// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RenderedMaterialBlock } from "./RenderedMaterialBlock";

vi.mock("../../../../shared/i18n", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

describe("free-writing material answer", () => {
  it("keeps the local draft while focused and flushes a completed IME composition", () => {
    const onAnswerChange = vi.fn();
    const props = {
      assetTags: {},
      assetUrls: {},
      block: {
        id: "writing-1",
        prompt: "Write a sentence",
        title: "Answer",
        type: "freeWriting" as const,
      },
      materialId: "material-1",
      mode: "classroom" as const,
      onAnswerChange,
    };
    const view = render(
      <RenderedMaterialBlock
        {...props}
        answer={{ type: "freeWriting", text: "Начало" }}
      />,
    );
    const textarea = screen.getByRole("textbox");

    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: "Начало текста" } });
    view.rerender(
      <RenderedMaterialBlock
        {...props}
        answer={{ type: "freeWriting", text: "Старое серверное значение" }}
      />,
    );
    expect(textarea).toHaveValue("Начало текста");

    fireEvent.compositionStart(textarea);
    fireEvent.change(textarea, { target: { value: "Привет" } });
    fireEvent.compositionEnd(textarea, { data: "т", target: { value: "Привет" } });

    expect(textarea).toHaveValue("Привет");
    expect(onAnswerChange).toHaveBeenLastCalledWith("writing-1", expect.objectContaining({
      text: "Привет",
      type: "freeWriting",
    }));
  });
});
