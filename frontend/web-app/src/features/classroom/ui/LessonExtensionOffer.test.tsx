// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonExtensionOffer } from "./LessonExtensionOffer";
import { observeServerTime, resetServerClock } from "../../../shared/lib/serverClock";
import type { LessonRoomSession } from "../model/session";
vi.mock("../../../shared/i18n", () => ({ useAppTranslation: () => ({ t: (key: string) => key }) }));
const at = (time: string) => Date.parse(`2026-10-04T07:${time}:00Z`);
const session = { lessonId: "lesson-1", canExtend: true, accessRevision: 0, accessEndsAt: "2026-10-04T07:25:00Z" } as LessonRoomSession;
describe("lesson extension offer", () => {
  afterEach(() => cleanup());
  beforeEach(() => { resetServerClock(); observeServerTime({ serverNow: "2026-10-04T07:23:00Z" }); });
  it("offers at the effective cutoff minus two minutes and then again at the extended cutoff", async () => {
    const onExtend = vi.fn().mockResolvedValue(undefined);
    const view = render(<LessonExtensionOffer session={session} nowMs={at("22")} onExtend={onExtend} />);
    expect(screen.queryByText("lessonExtension.extend")).toBeNull();
    view.rerender(<LessonExtensionOffer session={session} nowMs={at("23")} onExtend={onExtend} />);
    fireEvent.click(screen.getByText("lessonExtension.extend"));
    await waitFor(() => expect(onExtend).toHaveBeenCalledWith("lesson-1", 0));
    const extended = { ...session, accessRevision: 1, accessEndsAt: "2026-10-04T07:35:00Z" };
    view.rerender(<LessonExtensionOffer session={extended} nowMs={at("24")} onExtend={onExtend} />);
    expect(screen.queryByText("lessonExtension.extend")).toBeNull();
    view.rerender(<LessonExtensionOffer session={extended} nowMs={at("33")} onExtend={onExtend} />);
    expect(screen.getByText("lessonExtension.extend")).toBeTruthy();
  });
  it("does not show an extension control to a student or after expiry", () => {
    const onExtend = vi.fn();
    const view = render(<LessonExtensionOffer session={{ ...session, canExtend: false }} nowMs={at("23")} onExtend={onExtend} />);
    expect(screen.queryByText("lessonExtension.extend")).toBeNull();
    view.rerender(<LessonExtensionOffer session={session} nowMs={at("25")} onExtend={onExtend} />);
    expect(screen.queryByText("lessonExtension.extend")).toBeNull();
  });
  it("declining keeps this deadline dismissed and failure permits a retry", async () => {
    const onExtend = vi.fn().mockRejectedValue(new Error("network"));
    const view = render(<LessonExtensionOffer session={session} nowMs={at("23")} onExtend={onExtend} />);
    fireEvent.click(screen.getByText("lessonExtension.extend"));
    await screen.findByRole("alert");
    expect(screen.getByText("lessonExtension.extend")).not.toBeDisabled();
    fireEvent.click(screen.getByText("lessonExtension.decline"));
    expect(screen.queryByText("lessonExtension.extend")).toBeNull();
    view.rerender(<LessonExtensionOffer session={{ ...session, accessRevision: 1, accessEndsAt: "2026-10-04T07:35:00Z" }} nowMs={at("33")} onExtend={onExtend} />);
    expect(screen.getByText("lessonExtension.extend")).toBeTruthy();
  });
});
