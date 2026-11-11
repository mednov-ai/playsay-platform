// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { clearParallelDrafts, confirmParallelDraftPersisted, isParallelDraftPending, markParallelDraftPending, parallelDraftEpoch, readRetainedParallelDraft, retainParallelDraft } from "./parallelDraftGuard";

afterEach(() => { confirmParallelDraftPersisted("a"); confirmParallelDraftPersisted("b"); });

it("warns on reload until every changed context has a server persistence confirmation", () => {
  markParallelDraftPending("a");
  markParallelDraftPending("b");
  expect(isParallelDraftPending("a")).toBe(true);
  expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(false);
  confirmParallelDraftPersisted("a");
  expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(false);
  confirmParallelDraftPersisted("b");
  expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(true);
});

it("does not restore an old user's retained draft after explicit sign-out", () => {
  const oldEpoch = parallelDraftEpoch();
  retainParallelDraft("teacher:doc", { encoding: "yjs-update-v1", yjsUpdateBase64: "fixture" }, oldEpoch);
  markParallelDraftPending("teacher:doc");
  clearParallelDrafts();
  retainParallelDraft("teacher:doc", { encoding: "yjs-update-v1", yjsUpdateBase64: "stale" }, oldEpoch);
  expect(readRetainedParallelDraft("teacher:doc")).toBeUndefined();
  expect(isParallelDraftPending("teacher:doc")).toBe(false);
});
