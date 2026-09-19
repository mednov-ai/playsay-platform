// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { VocabularyPractice } from "../../../shared/api/playsay";
import { VocabularyLiveStage } from "./VocabularyLiveStage";
const updateStatus = vi.fn().mockRejectedValue(new Error("internal detail"));
vi.mock("../../../shared/api/playsay", () => ({
  updateVocabularyPracticeStatus: (...args: unknown[]) => updateStatus(...args),
  createVocabularyHomeworkAssignment: vi.fn(), giveVocabularyPracticeHint: vi.fn(), requestVocabularyPracticeHelp: vi.fn(),
}));
vi.mock("../../../shared/i18n", () => ({ useAppTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("./VocabularyPracticePlayer", () => ({ VocabularyPracticePlayer: () => null }));
afterEach(cleanup);
it("shows a recoverable localized command error without announcing success", async () => {
  const changed = vi.fn();
  render(<VocabularyLiveStage canManage onClose={vi.fn()} onPracticeChange={changed} practice={{ id: "p", status: "ACTIVE", sessions: [] } as unknown as VocabularyPractice} />);
  fireEvent.click(screen.getByText("vocabulary.live.pause"));
  expect(await screen.findByRole("alert")).toHaveTextContent("vocabulary.practice.errors.save");
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByText("vocabulary.live.pause")).toBeEnabled();
  expect(screen.queryByText("internal detail")).not.toBeInTheDocument();
});
