// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VocabularyEntryDialog, useVocabularyEntryFormController } from "./VocabularyEntryDialog";
const api = vi.hoisted(() => ({ create: vi.fn(), suggest: vi.fn() }));
vi.mock("../../../shared/api/playsay", () => ({ createVocabularyEntry: api.create, suggestVocabularyTranslation: api.suggest }));
vi.mock("../../../shared/i18n", () => ({ useAppTranslation: () => ({ t: (key: string, values?: unknown) => key + (values ? JSON.stringify(values) : "") }) }));
afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => { vi.clearAllMocks(); api.suggest.mockResolvedValue({ variants: [] }); });
function mount() {
 const onSaved = vi.fn();
 render(<VocabularyEntryDialog open onClose={vi.fn()} onSaved={onSaved} source={{ sourceType: "LESSON", ownerSubject: "a" }} recipientSubjects={["a", "b"]} />);
 fireEvent.change(screen.getByLabelText("vocabulary.fields.word"), { target: { value: "book" } });
 fireEvent.change(screen.getByLabelText("vocabulary.fields.translation"), { target: { value: "книга" } });
 return onSaved;
}
it("reports partial group success, refreshes successes and retries only failed recipients", async () => {
 api.create.mockImplementation(async ({ ownerSubject }) => {
   if (ownerSubject === "b") throw new Error("offline");
   return { id: "entry-a", ownerSubject };
 });
 const onSaved = mount();
 fireEvent.click(screen.getByLabelText("vocabulary.fields.allParticipants"));
 fireEvent.click(screen.getByRole("button", { name: "vocabulary.actions.save" }));
 expect(await screen.findByRole("status")).toHaveTextContent('vocabulary.messages.partiallySaved{"saved":1,"total":2,"participants":"2"}');
 expect(onSaved).toHaveBeenCalledWith([{ id: "entry-a", ownerSubject: "a" }]);
 expect(screen.getByLabelText("vocabulary.fields.word")).toHaveValue("book");
 api.create.mockResolvedValue({ id: "entry-b", ownerSubject: "b" });
 fireEvent.click(screen.getByRole("button", { name: "vocabulary.actions.save" }));
 await screen.findByText("vocabulary.messages.saved");
 expect(api.create.mock.calls.map(([input]) => input.ownerSubject)).toEqual(["a", "b", "b"]);
 expect(screen.getByLabelText("vocabulary.fields.word")).toHaveValue("");
});
it("saves text while the translator is pending and ignores its late reply", async () => {
 let finish!: (value: unknown) => void;
 api.suggest.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
 api.create.mockResolvedValue({ id: "entry-a" });
 mount();
 // A new word allows automatic translation; manual input is independently protected below.
 fireEvent.change(screen.getByLabelText("vocabulary.fields.word"), { target: { value: "pear" } });
 await waitFor(() => expect(api.suggest).toHaveBeenCalled());
 expect(screen.getByRole("button", { name: "vocabulary.actions.save" })).toBeEnabled();
 fireEvent.click(screen.getByRole("button", { name: "vocabulary.actions.save" }));
 await screen.findByText("vocabulary.messages.saved");
 await act(async () => { finish({ variants: [{ translation: "late translation" }] }); });
 expect(api.create.mock.calls[0][0].translationState).toBe("MISSING");
 expect(screen.getByLabelText("vocabulary.fields.translation")).toHaveValue("");
});
it("does not overwrite a manual translation with a pending provider response", async () => {
 let finish!: (value: unknown) => void;
 api.suggest.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
 mount();
 fireEvent.change(screen.getByLabelText("vocabulary.fields.word"), { target: { value: "pear" } });
 await waitFor(() => expect(api.suggest).toHaveBeenCalled());
 fireEvent.change(screen.getByLabelText("vocabulary.fields.translation"), { target: { value: "мой перевод" } });
 await act(async () => { finish({ variants: [{ translation: "late translation" }] }); });
 expect(screen.getByLabelText("vocabulary.fields.translation")).toHaveValue("мой перевод");
});
it("guards duplicate saves even within the same render", async () => {
 let finish!: (value: unknown) => void;
 api.create.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
 const { result } = renderHook(() => useVocabularyEntryFormController({ active: true, source: { sourceType: "MANUAL" } }));
 act(() => result.current.changeSourceText("book"));
 act(() => { void result.current.save(); void result.current.save(); });
 expect(api.create).toHaveBeenCalledTimes(1);
 await act(async () => { finish({ id: "entry" }); });
});
