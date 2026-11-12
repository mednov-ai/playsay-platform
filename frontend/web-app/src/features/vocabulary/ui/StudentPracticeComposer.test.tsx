// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudentPracticeComposer } from "./StudentPracticeComposer";

const preview = vi.fn();
const createRecipe = vi.fn();
const start = vi.fn();
const fetchRecipes = vi.fn();

vi.mock("../../../shared/api/playsay", () => ({
  createVocabularySelectionRecipe: (...args: unknown[]) => createRecipe(...args),
  fetchVocabularySelectionRecipes: (...args: unknown[]) => fetchRecipes(...args),
  previewRecommendedVocabularyPractice: (...args: unknown[]) => preview(...args),
  startSelfVocabularyPractice: (...args: unknown[]) => start(...args),
}));
vi.mock("../../../shared/i18n", () => ({ useAppTranslation: () => ({ t: (key: string) => key }) }));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  preview.mockReset();
  createRecipe.mockReset();
  start.mockReset();
  fetchRecipes.mockReset();
  fetchRecipes.mockResolvedValue([]);
});

it("edits a dynamic selection, saves a recipe, and launches the immutable preview", async () => {
  preview.mockResolvedValue({
    delivery: "SELF",
    estimatedMinutes: 3,
    expiresAt: "2026-08-21T10:00:00Z",
    mode: "BALANCED",
    owners: [{
      dueCount: 1,
      entries: [entry],
      estimatedItemCount: 2,
      needsTranslationCount: 0,
      newCount: 0,
      ownerSubject: "learner",
      selectedCount: 1,
      selection: [{ entry, readinessWarnings: [], reason: "DUE_TODAY" }],
    }],
    planId: "plan-1",
    revision: 1,
  });
  createRecipe.mockResolvedValue({ id: "recipe-1" });
  start.mockResolvedValue({ sessions: [{ id: "session-1" }] });
  const onStart = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <StudentPracticeComposer onStart={onStart} />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(screen.getByText("steady")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "vocabulary.selfComposer.source.RECENT" }));
  await waitFor(() => expect(preview.mock.calls.at(-1)?.[0].selection.sources).toContain("RECENT"));
  fireEvent.click(screen.getByRole("button", { name: "vocabulary.selfComposer.skill.SPELLING" }));
  await waitFor(() => expect(preview.mock.calls.at(-1)?.[0].selection.preferredSkills).toContain("SPELLING"));
  fireEvent.change(screen.getByLabelText("vocabulary.selfComposer.recipeName"), { target: { value: "My review" } });
  fireEvent.click(screen.getByRole("button", { name: "vocabulary.selfComposer.save" }));
  await waitFor(() => expect(createRecipe).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "vocabulary.today.start" }));
  await waitFor(() => expect(start).toHaveBeenCalledWith({ planId: "plan-1", planRevision: 1 }));
  expect(onStart).toHaveBeenCalledWith({ id: "session-1" });
});

it("re-resolves a saved dynamic recipe and reports an empty selection accessibly", async () => {
  fetchRecipes.mockResolvedValue([{
    excludedEntryIds: [],
    id: "recipe-1",
    mode: "WRITING",
    name: "Forgotten words",
    pinnedEntryIds: [],
    selection: { sources: ["FORGOTTEN"], preferredSkills: ["FORM"] },
    wordLimit: 6,
  }]);
  preview.mockResolvedValue({
    delivery: "SELF",
    estimatedMinutes: 0,
    expiresAt: "2026-08-21T10:00:00Z",
    mode: "WRITING",
    owners: [{ dueCount: 0, entries: [], estimatedItemCount: 0, needsTranslationCount: 0, newCount: 0, ownerSubject: "learner", selectedCount: 0, selection: [] }],
    planId: "plan-empty",
    revision: 2,
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <StudentPracticeComposer onStart={vi.fn()} />
    </QueryClientProvider>,
  );

  await screen.findByText("Forgotten words");
  fireEvent.change(screen.getByLabelText("vocabulary.selfComposer.saved"), { target: { value: "recipe-1" } });
  await waitFor(() => expect(preview.mock.calls.at(-1)?.[0]).toMatchObject({
    mode: "WRITING",
    selection: { preferredSkills: ["FORM"], sources: ["FORGOTTEN"] },
    wordLimit: 6,
  }));
  expect(await screen.findByText("vocabulary.selfComposer.empty")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "vocabulary.today.start" })).toBeDisabled();
});

it("distinguishes a failed preview from an empty result and retries it", async () => {
  preview.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({
    estimatedMinutes: 3,
    owners: [{ estimatedItemCount: 2, selectedCount: 1, selection: [{ entry, reason: "DUE_TODAY" }] }],
    planId: "plan-recovered",
    revision: 1,
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <StudentPracticeComposer onStart={vi.fn()} />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("vocabulary.practice.errors.preview")).toHaveAttribute("aria-live", "assertive");
  expect(screen.queryByText("vocabulary.selfComposer.empty")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "vocabulary.selfComposer.source.DUE" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "vocabulary.today.start" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "vocabulary.practice.actions.retry" }));
  expect(await screen.findByText("steady")).toBeInTheDocument();
  expect(screen.queryByText("vocabulary.practice.errors.preview")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "vocabulary.today.start" })).toHaveFocus());
  expect(screen.getByRole("button", { name: "vocabulary.today.start" })).toBeEnabled();
});

it("moves focus to the empty result when retry succeeds without words", async () => {
  preview.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({
    estimatedMinutes: 0,
    owners: [{ estimatedItemCount: 0, selectedCount: 0, selection: [] }],
    planId: "plan-empty",
    revision: 1,
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <StudentPracticeComposer onStart={vi.fn()} />
    </QueryClientProvider>,
  );
  await screen.findByText("vocabulary.practice.errors.preview");
  fireEvent.click(screen.getByRole("button", { name: "vocabulary.practice.actions.retry" }));
  const empty = await screen.findByText("vocabulary.selfComposer.empty");
  await waitFor(() => expect(empty).toHaveFocus());
  expect(screen.getByRole("button", { name: "vocabulary.today.start" })).toBeDisabled();
});

it("returns focus to retry when the retry fails", async () => {
  preview.mockRejectedValue(new Error("offline"));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <StudentPracticeComposer onStart={vi.fn()} />
    </QueryClientProvider>,
  );
  await screen.findByText("vocabulary.practice.errors.preview");
  const retry = screen.getByRole("button", { name: "vocabulary.practice.actions.retry" });
  fireEvent.click(retry);
  await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(retry).toHaveFocus());
});

it("does not move focus if the user leaves retry while it is running", async () => {
  let resolvePreview!: (value: unknown) => void;
  preview.mockRejectedValueOnce(new Error("offline"))
    .mockImplementationOnce(() => new Promise(resolve => { resolvePreview = resolve; }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <StudentPracticeComposer onStart={vi.fn()} />
    </QueryClientProvider>,
  );
  await screen.findByText("vocabulary.practice.errors.preview");
  fireEvent.click(screen.getByRole("button", { name: "vocabulary.practice.actions.retry" }));
  const input = screen.getByLabelText("vocabulary.selfComposer.recipeName");
  input.focus();
  await act(async () => resolvePreview({
    estimatedMinutes: 3,
    owners: [{ estimatedItemCount: 2, selectedCount: 1, selection: [{ entry, reason: "DUE_TODAY" }] }],
    planId: "plan-recovered",
    revision: 1,
  }));
  await screen.findByText("steady");
  expect(input).toHaveFocus();
});

it("does not start an old preview after a refresh fails", async () => {
  const result = {
    estimatedMinutes: 3,
    owners: [{ estimatedItemCount: 2, selectedCount: 1, selection: [{ entry, reason: "DUE_TODAY" }] }],
    planId: "plan-cached",
    revision: 1,
  };
  preview.mockResolvedValueOnce(result).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(result);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StudentPracticeComposer onStart={vi.fn()} />
    </QueryClientProvider>,
  );

  await screen.findByText("steady");
  await act(async () => { await client.invalidateQueries({ queryKey: ["vocabulary-self-preview"] }); });
  expect(await screen.findByText("vocabulary.practice.errors.preview")).toBeInTheDocument();
  expect(screen.getByText("steady")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "vocabulary.today.start" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "vocabulary.practice.actions.retry" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "vocabulary.today.start" })).toBeEnabled());
  expect(screen.queryByText("vocabulary.practice.errors.preview")).not.toBeInTheDocument();
});

const entry = {
  createdAt: "2026-08-20T10:00:00Z",
  favorite: false,
  id: "entry-1",
  occurrences: [],
  practicePaused: false,
  sourceLanguage: "en",
  sourceText: "steady",
  status: "ACTIVE",
  targetLanguage: "ru",
  translation: "устойчивый",
  translationState: "CONFIRMED",
  updatedAt: "2026-08-20T10:00:00Z",
};
