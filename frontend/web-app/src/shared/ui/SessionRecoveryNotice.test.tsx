// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../i18n";
import { SessionRecoveryNotice } from "./SessionRecoveryNotice";

afterEach(cleanup);
describe("session recovery notice", () => {
  it.each(["ru", "en", "de", "fr"])("offers a localized explicit action during a lesson in %s", async (language) => {
    await i18n.changeLanguage(language);
    const onSignIn = vi.fn();
    const view = render(<SessionRecoveryNotice phase="signInRequired" activeClassroom onRetry={vi.fn()} onSignIn={onSignIn} />);
    expect(view.getByRole("status").textContent).toContain(i18n.t("sessionRecovery.lessonInterruption"));
    expect(onSignIn).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: i18n.t("sessionRecovery.signIn") }));
    expect(onSignIn).toHaveBeenCalledOnce();
    expect(view.container.textContent).not.toContain("sessionRecovery.");
  });
  it("announces temporary recovery and exposes Retry when its budget ends", () => {
    const onRetry = vi.fn();
    const view = render(<SessionRecoveryNotice phase="recovering" activeClassroom={false} onRetry={onRetry} onSignIn={vi.fn()} />);
    expect(view.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(view.queryByRole("button")).toBeNull();
    view.rerender(<SessionRecoveryNotice phase="unavailable" activeClassroom={false} onRetry={onRetry} onSignIn={vi.fn()} />);
    fireEvent.click(view.getByRole("button", { name: i18n.t("sessionRecovery.retry") }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
