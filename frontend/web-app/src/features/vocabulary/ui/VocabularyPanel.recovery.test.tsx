// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MeProfile } from "../../../shared/api/playsay";
import { VocabularyPanel } from "./VocabularyPanel";

const api = vi.hoisted(() => ({ dashboard: vi.fn(), history: vi.fn(), learners: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn() }));
vi.mock("../../../shared/api/playsay", () => ({
  fetchVocabularyDashboard: api.dashboard, fetchVocabularyPracticeHistory: api.history,
  fetchVocabularyLearners: api.learners, createVocabularyEntry: api.create,
  updateVocabularyEntry: api.update, archiveVocabularyEntry: api.archive,
  suggestVocabularyTranslation: vi.fn().mockRejectedValue(new Error("offline")),
}));
vi.mock("../../../shared/i18n", () => ({ useAppTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../../shared/config/vocabularyFeatures", () => ({ vocabularyFeatures: { practice: false, generatedMedia: false, homework: false } }));
vi.mock("./VocabularyPracticeDrawer", () => ({ VocabularyPracticeDrawer: () => null }));
vi.mock("./VocabularyPracticePlayer", () => ({ VocabularyPracticePlayer: () => null }));
vi.mock("./StudentPracticeComposer", () => ({ StudentPracticeComposer: () => null }));
vi.mock("./VocabularyMediaCard", () => ({ VocabularyMediaCard: () => null }));
vi.mock("./VocabularyMediaReviewQueue", () => ({ VocabularyMediaReviewQueue: () => null }));
const entry = { id: "entry-1", ownerSubject: "student-1", sourceText: "apple", translation: "яблоко", occurrences: [], updatedAt: "2026-09-05T10:00:00Z", practicePaused: false };
const learner = { ownerSubject: "student-1", ownerName: "Synthetic learner", dueCount: 0, learningCount: 1, masteredCount: 0 };
let entries: typeof entry[];
const dashboard = () => ({ totalCount: entries.length, entries: entries.map((entry) => ({ entry, skills: [], stage: "NEW", overdue: false })) });
function mount(teacher = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><VocabularyPanel profile={{ roles: [teacher ? "TEACHER" : "STUDENT"] } as MeProfile} /></QueryClientProvider>);
  return client;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => {
  vi.clearAllMocks(); entries = [entry];
  api.dashboard.mockImplementation(async () => dashboard());
  api.history.mockResolvedValue([]); api.learners.mockResolvedValue([learner]);
  api.archive.mockImplementation(async () => { entries = []; });
  api.update.mockImplementation(async (_id, update) => { entries = [{ ...entry, ...update }]; return entries[0]; });
  api.create.mockImplementation(async (input) => { const added = { ...entry, ...input, id: "entry-2" }; entries.push(added); return added; });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
it.each([false, true])("refreshes a successful add and preserves the learner/filter (teacher=%s)", async (teacher) => {
  mount(teacher);
  if (teacher) fireEvent.click(await screen.findByRole("button", { name: /Synthetic learner/ }));
  await screen.findByText("apple");
  fireEvent.change(screen.getByLabelText("vocabulary.search"), { target: { value: "pe" } });
  if (teacher) fireEvent.click(screen.getByRole("button", { name: "vocabulary.actions.search" }));
  fireEvent.click(screen.getByRole("button", { name: "vocabulary.actions.add" }));
  fireEvent.change(screen.getByLabelText("vocabulary.fields.word"), { target: { value: "pear" } });
  fireEvent.click(screen.getByRole("button", { name: "vocabulary.actions.save" }));
  await screen.findByText("vocabulary.messages.saved");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "common.actions.close" }));
  await screen.findByText("pear");
  expect(screen.getByLabelText("vocabulary.search")).toHaveValue("pe");
  expect(api.create.mock.calls[0][0].ownerSubject).toBe(teacher ? "student-1" : undefined);
});
it("reports initial dashboard failure and recovers without claiming an empty dictionary", async () => {
  api.dashboard.mockRejectedValueOnce(new Error("private server details"));
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("vocabulary.messages.loadFailed");
  expect(screen.queryByText("vocabulary.empty")).not.toBeInTheDocument();
  expect(screen.queryByText("private server details")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "vocabulary.actions.retry" }));
  await screen.findByText("apple");
});
it("shows words while history is still pending, then reports history failure independently", async () => {
  let fail!: (reason: Error) => void;
  api.history.mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
  mount();
  await screen.findByText("apple");
  fail(new Error("history offline"));
  fireEvent.click(screen.getByRole("button", { name: "vocabulary.tabs.HISTORY" }));
  await screen.findByRole("alert");
  expect(screen.queryByText("vocabulary.history.empty")).not.toBeInTheDocument();
});
it("keeps undo available after archiving the last visible word and supports failed undo retry", async () => {
  mount(); await screen.findByText("apple");
  fireEvent.click(screen.getByRole("button", { name: "vocabulary.actions.archive" }));
  await screen.findByText("vocabulary.empty");
  api.update.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "common.actions.undo" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "vocabulary.actions.retry" }));
  await screen.findByText("apple");
  expect(screen.queryByRole("button", { name: "common.actions.undo" })).not.toBeInTheDocument();
});
it("reports a failed mutation, keeps the word and retries the same operation", async () => {
  api.archive.mockRejectedValueOnce(new Error("private details"));
  mount(); await screen.findByText("apple");
  fireEvent.click(screen.getByRole("button", { name: "vocabulary.actions.archive" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("vocabulary.messages.saveFailed");
  expect(screen.getByText("apple")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "vocabulary.actions.retry" }));
  await waitFor(() => expect(screen.queryByText("apple")).not.toBeInTheDocument());
});

it("keeps stale words with an explicit refetch error and recovers", async () => {
  const client = mount(); await screen.findByText("apple");
  api.dashboard.mockRejectedValueOnce(new Error("offline"));
  await client.invalidateQueries({ queryKey: ["vocabulary-dashboard"] });
  await screen.findByRole("alert");
  expect(screen.getByText("apple")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "vocabulary.actions.retry" }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
});
it("hides stale vocabulary when access is denied", async () => {
  const client = mount(); await screen.findByText("apple");
  api.dashboard.mockRejectedValueOnce(new Error("HTTP 403"));
  await client.invalidateQueries({ queryKey: ["vocabulary-dashboard"] });
  expect(await screen.findByRole("alert")).toHaveTextContent("vocabulary.messages.accessDenied");
  expect(screen.queryByText("apple")).not.toBeInTheDocument();
});
it("disables mutations until the server confirms the previous action", async () => {
  let finish!: () => void;
  api.update.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  mount(); await screen.findByText("apple");
  const favorite = screen.getByRole("button", { name: "vocabulary.actions.favorite" });
  fireEvent.click(favorite); fireEvent.click(favorite);
  expect(favorite).toBeDisabled();
  expect(screen.getByRole("button", { name: "vocabulary.actions.archive" })).toBeDisabled();
  expect(api.update).toHaveBeenCalledTimes(1);
  finish();
  await waitFor(() => expect(favorite).toBeEnabled());
});
it("preserves edits and shows a safe error when saving fails", async () => {
  api.update.mockRejectedValueOnce(new Error("private error"));
  mount(); await screen.findByText("apple");
  fireEvent.click(screen.getByRole("button", { name: "vocabulary.actions.edit" }));
  fireEvent.change(screen.getByLabelText("vocabulary.fields.translation"), { target: { value: "edited" } });
  fireEvent.click(screen.getByRole("button", { name: "vocabulary.actions.save" }));
  await screen.findByText("vocabulary.messages.saveFailed");
  expect(screen.getByLabelText("vocabulary.fields.translation")).toHaveValue("edited");
  expect(screen.queryByText("private error")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "vocabulary.actions.save" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await screen.findByText("edited");
});
