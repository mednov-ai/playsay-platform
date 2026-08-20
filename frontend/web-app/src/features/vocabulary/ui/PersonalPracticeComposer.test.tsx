// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalPracticeComposer } from "./PersonalPracticeComposer";

const previewVocabularyPractice = vi.fn();

vi.mock("../../../shared/api/playsay", () => ({
  fetchVocabularyDashboard: vi.fn().mockResolvedValue({ entries: [] }),
  fetchVocabularySelectionRecipes: vi.fn().mockResolvedValue([]),
  previewVocabularyPractice: (...args: unknown[]) => previewVocabularyPractice(...args),
}));

vi.mock("../../../shared/i18n", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);
beforeEach(() => previewVocabularyPractice.mockReset());

describe("PersonalPracticeComposer", () => {
  it("selects present learners by default and supports exclusion undo", async () => {
    previewVocabularyPractice.mockResolvedValue({
      delivery: "LIVE",
      estimatedMinutes: 2,
      expiresAt: "2026-07-30T10:00:00Z",
      mode: "BALANCED",
      owners: [{
        dueCount: 1,
        entries: [entry],
        estimatedItemCount: 2,
        exerciseDistribution: [],
        needsTranslationCount: 0,
        newCount: 0,
        ownerName: "Anna",
        ownerSubject: "student-present",
        ownerUsername: "anna",
        sampleItems: [],
        selectedCount: 1,
        selection: [{ entry, readinessWarnings: [], reason: "DUE_TODAY" }],
      }],
      planId: "plan-1",
      revision: 1,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PersonalPracticeComposer
          actionLabel="start"
          delivery="LIVE"
          onPublish={vi.fn()}
          owners={[
            { name: "Anna", presence: "PRESENT", subject: "student-present" },
            { name: "Ben", presence: "ABSENT", subject: "student-absent" },
          ]}
        />
      </QueryClientProvider>,
    );

    const learners = screen.getAllByRole("checkbox");
    expect(learners[0]).toBeChecked();
    expect(learners[1]).not.toBeChecked();
    await waitFor(() => expect(screen.getByText("steady")).toBeInTheDocument(), { timeout: 2_000 });

    fireEvent.click(screen.getByRole("button", { name: "vocabulary.practice.builder.exclude" }));
    const undo = screen.getByRole("button", { name: "steady" });
    expect(undo).toBeInTheDocument();
    fireEvent.click(undo);
    expect(screen.queryByRole("button", { name: "steady" })).not.toBeInTheDocument();
  });

  it("publishes a frozen homework plan with the meaningful activity policy by default", async () => {
    previewVocabularyPractice.mockResolvedValue({
      delivery: "HOMEWORK",
      estimatedMinutes: 2,
      expiresAt: "2026-07-30T10:00:00Z",
      mode: "BALANCED",
      owners: [{
        dueCount: 1,
        entries: [entry],
        estimatedItemCount: 2,
        needsTranslationCount: 0,
        newCount: 0,
        ownerSubject: "student-present",
        selectedCount: 1,
        selection: [{ entry, readinessWarnings: [], reason: "DUE_TODAY" }],
      }],
      planId: "plan-homework",
      revision: 3,
    });
    const onPublish = vi.fn().mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PersonalPracticeComposer
          actionLabel="assign"
          delivery="HOMEWORK"
          onPublish={onPublish}
          owners={[{ name: "Anna", subject: "student-present" }]}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText("steady")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "assign" }));

    await waitFor(() => expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({ planId: "plan-homework", revision: 3 }),
      expect.objectContaining({
        completionPolicy: "MEANINGFUL_ACTIVITY",
        completionThresholds: expect.objectContaining({ distinctEntries: 4, distinctGradedPrompts: 8 }),
        planId: "plan-homework",
        planRevision: 3,
      }),
    ));
  });
});

const entry = {
  id: "entry-1",
  practicePaused: false,
  sourceLanguage: "en",
  sourceText: "steady",
  status: "ACTIVE",
  targetLanguage: "ru",
  translation: "устойчивый",
  translationState: "CONFIRMED",
  updatedAt: "2026-07-29T10:00:00Z",
};
