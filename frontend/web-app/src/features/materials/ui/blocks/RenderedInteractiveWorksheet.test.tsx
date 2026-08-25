// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MaterialAnswerBlock, MaterialEditorBlock, MaterialExerciseParticipant } from "../../model/materialDocument";
import { RenderedInteractiveWorksheet } from "./RenderedInteractiveWorksheet";

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { clear: () => values.clear(), getItem: (key: string) => values.get(key) ?? null, key: (index: number) => Array.from(values.keys())[index] ?? null, get length() { return values.size; }, removeItem: (key: string) => values.delete(key), setItem: (key: string, value: string) => values.set(key, value) },
  });
});

afterEach(cleanup);

const region = { x: 100, y: 100, width: 180, height: 60 };
const block: MaterialEditorBlock = {
  id: "worksheet",
  type: "interactiveWorksheet",
  title: "Worksheet",
  sourceAsset: "material-asset:00000000-0000-0000-0000-000000000001",
  intrinsicWidth: 800,
  intrinsicHeight: 1200,
  worksheetGroups: [
    { id: "typed", order: 0, type: "FILL_GAPS", gapMode: "TYPED", assessment: { maxAttempts: 3 }, gaps: [{ id: "typed-gap", region, acceptedAnswers: ["am", "'m"] }] },
    { id: "choice-gap", order: 1, type: "FILL_GAPS", gapMode: "SINGLE_CHOICE", gaps: [{ id: "select-gap", region: { ...region, y: 180 }, acceptedAnswers: ["is"], options: ["am", "is"] }] },
    { id: "bank", order: 2, type: "FILL_GAPS", gapMode: "WORD_BANK", wordBank: ["are", "is"], gaps: [{ id: "bank-gap", region: { ...region, y: 260 }, acceptedAnswers: ["are"] }] },
    { id: "form", order: 3, type: "FILL_GAPS", gapMode: "FORM_TRANSFORM", gaps: [{ id: "form-gap", region: { ...region, y: 340 }, acceptedAnswers: ["went"], baseForm: "go" }] },
    { id: "pairs", order: 4, type: "MATCHING_PAIRS", assessment: { maxErrors: 2 }, pairs: [
      { id: "pair-a", number: 1, left: { region: { ...region, y: 430 }, text: "cat" }, right: { region: { ...region, x: 600, y: 430 }, text: "кот" } },
      { id: "pair-b", number: 2, left: { region: { ...region, y: 510 }, kind: "IMAGE", imageAlt: "dog picture" }, right: { region: { ...region, x: 600, y: 510 }, text: "собака" } },
    ] },
    { id: "choice", order: 5, type: "MULTIPLE_CHOICE", questions: [{ id: "question", prompt: "Choose", correctOptionIds: ["option-a", "option-b"], promptRegion: { ...region, y: 590 }, options: [{ id: "option-a", order: 0, text: "A", region: { ...region, y: 670 } }, { id: "option-b", order: 1, text: "B", region: { ...region, x: 600, y: 670 } }] }] },
    { id: "cards", order: 6, type: "FLASHCARDS", cards: [{ id: "card", order: 0, front: { kind: "TEXT", text: "front", region: { ...region, y: 760 } }, back: { kind: "TEXT", text: "private back", region: { ...region, y: 840 } } }] },
  ],
};

function Harness({ participants = [], onInteractionChange = vi.fn() }: { participants?: MaterialExerciseParticipant[]; onInteractionChange?: (value: unknown) => void }) {
  const [answer, setAnswer] = useState<MaterialAnswerBlock>();
  return <RenderedInteractiveWorksheet answer={answer} assetUrls={{ "00000000-0000-0000-0000-000000000001": "blob:page" }} block={block} onAnswerChange={(_id, next) => setAnswer(next)} onInteractionChange={onInteractionChange} participants={participants} />;
}

describe("RenderedInteractiveWorksheet", () => {
  it("evaluates all scored overlay modes without exposing answers before evaluation", () => {
    render(<Harness />);
    expect(screen.queryByText("private back")).toBeNull();

    const typed = screen.getByRole("textbox", { name: /gap 1\.1/i });
    fireEvent.change(typed, { target: { value: "are" } });
    fireEvent.click(screen.getAllByRole("button", { name: /check answer/i })[0]);
    expect(typed).toHaveAttribute("data-status", "wrong");
    fireEvent.change(typed, { target: { value: "'m" } });
    fireEvent.keyDown(typed, { key: "Enter" });
    expect(typed).toHaveAttribute("data-status", "retry");

    fireEvent.change(screen.getByRole("combobox", { name: /gap 2\.1/i }), { target: { value: "is" } });
    fireEvent.click(screen.getByRole("button", { name: "are" }));
    fireEvent.click(screen.getByRole("button", { name: /worksheet gap 3\.1/i }));
    expect(screen.getByRole("button", { name: /worksheet gap 3\.1/i })).toHaveAttribute("data-status", "correct");

    const form = screen.getByRole("textbox", { name: /gap 4\.1/i });
    expect(form).toHaveAttribute("placeholder", "go");
    fireEvent.change(form, { target: { value: "went" } });
    fireEvent.keyDown(form, { key: "Enter" });
    expect(form).toHaveAttribute("data-status", "correct");
    fireEvent.click(screen.getByRole("button", { name: /left matching item 1/i }));
    fireEvent.click(screen.getByRole("button", { name: /right matching item 2/i }));
    expect(screen.getByRole("button", { name: /left matching item 1/i })).toHaveAttribute("data-status", "selected");
    fireEvent.click(screen.getByRole("button", { name: /right matching item 1/i }));
    expect(screen.getByRole("button", { name: /left matching item 1/i })).toHaveAttribute("data-status", "solved");

    fireEvent.click(screen.getByRole("button", { name: /question 1, option 1/i }));
    fireEvent.click(screen.getByRole("button", { name: /question 1, option 2/i }));
    fireEvent.click(screen.getByRole("button", { name: /check question 1/i }));
    expect(screen.getByRole("button", { name: /question 1, option 1/i })).toHaveAttribute("data-status", "correct");

    fireEvent.click(screen.getByRole("button", { name: /reveal flashcard/i }));
    expect(screen.getByText("private back")).toBeTruthy();
  });

  it("publishes remote matching selection and identifies it beyond color", () => {
    const onInteractionChange = vi.fn();
    const participants: MaterialExerciseParticipant[] = [{ clientId: 7, color: "#123456", name: "Teacher", interaction: { blockId: "worksheet", kind: "matchingSelection", leftId: "pair-a", worksheetGroupId: "pairs" } }];
    render(<Harness onInteractionChange={onInteractionChange} participants={participants} />);
    const left = screen.getByRole("button", { name: /left matching item 1/i });
    expect(left).toHaveAttribute("data-live-active", "true");
    expect(left).toHaveAttribute("title", "Teacher");
    fireEvent.click(left);
    expect(onInteractionChange).toHaveBeenCalledWith(expect.objectContaining({ kind: "matchingSelection", worksheetGroupId: "pairs" }));
  });

  it("zooms the shared source and overlay surface without changing normalized positions", () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));
    expect(container.querySelector<HTMLElement>(".playsay-interactive-worksheet")?.style.width).toBe("125%");
    expect((screen.getAllByRole("textbox")[0] as HTMLElement).parentElement?.style.left).toBe("10%");
  });

  it("keeps reviewed order, accessible names, status announcements, and non-color pair identity", () => {
    const { container } = render(<Harness />);
    const overlay = container.querySelector(".playsay-worksheet-overlay")!;
    const controls = Array.from(overlay.querySelectorAll<HTMLElement>("input,select,button"));

    expect(controls[0]).toHaveAccessibleName("Worksheet gap 1.1");
    expect(controls.find((control) => control.getAttribute("aria-label")?.includes("Left matching item 1"))).toHaveTextContent("1");
    expect(controls.find((control) => control.getAttribute("aria-label")?.includes("Right matching item 1"))).toHaveTextContent("A");
    expect(controls.every((control) => control.tabIndex >= 0)).toBe(true);
    expect(overlay.querySelectorAll('[role="status"], [aria-live="polite"]').length).toBeGreaterThan(0);
    expect(container).not.toHaveTextContent("went");
    expect(container).not.toHaveTextContent("private back");
  });
});
