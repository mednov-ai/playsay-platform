// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameAdaptationReviewDialog } from "./GameAdaptationReviewDialog";

vi.mock("../../../shared/i18n", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("./blocks/HtmlGameFrame", () => ({
  HtmlGameFrame: ({
    onRuntimeStatusChange,
  }: {
    onRuntimeStatusChange?: (status: "checking" | "ready" | "failed") => void;
  }) => (
    <div>
      <button onClick={() => onRuntimeStatusChange?.("ready")} type="button">runtime-ready</button>
      <button onClick={() => onRuntimeStatusChange?.("failed")} type="button">runtime-failed</button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("GameAdaptationReviewDialog", () => {
  it("keeps Apply disabled until the sandboxed game reports a successful startup", () => {
    const onApply = vi.fn();
    render(
      <GameAdaptationReviewDialog
        html="<html></html>"
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );

    const apply = screen.getByRole("button", { name: "materials.gameAdaptationReview.apply" }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.click(apply);
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "runtime-ready" }));
    expect(apply.disabled).toBe(false);
    expect(screen.getByRole("status").textContent).toContain("materials.gameAdaptationReview.runtime.ready");

    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("latches a runtime failure and keeps Apply disabled", () => {
    render(
      <GameAdaptationReviewDialog
        html="<html></html>"
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "runtime-failed" }));
    fireEvent.click(screen.getByRole("button", { name: "runtime-ready" }));

    expect((screen.getByRole("button", { name: "materials.gameAdaptationReview.apply" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("materials.gameAdaptationReview.runtime.failed");
  });

  it("fails the startup gate when no handshake arrives within eight seconds", () => {
    vi.useFakeTimers();
    render(
      <GameAdaptationReviewDialog
        html="<html></html>"
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(8_000);
    });

    expect((screen.getByRole("button", { name: "materials.gameAdaptationReview.apply" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("materials.gameAdaptationReview.runtime.failed");
  });
});
