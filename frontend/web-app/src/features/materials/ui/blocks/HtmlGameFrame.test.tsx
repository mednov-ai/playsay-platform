// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }

import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MaterialHtmlGameSync } from "../../model/materialDocument";
import { HtmlGameFrame, createSandboxedGameDocument } from "./HtmlGameFrame";

vi.mock("../../../../shared/i18n", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

const gameHtml = "<html><head><title>Game</title></head><body><button id=\"start\">Start</button><script>document.body.dataset.ready = 'true'</script></body></html>";

afterEach(cleanup);

describe("HTML game sandbox", () => {
  it("injects an offline bridge and keeps game scripts only in the authority document", () => {
    const authority = createSandboxedGameDocument(gameHtml, "run-authority", false);
    const mirror = createSandboxedGameDocument(gameHtml, "run-mirror", true);

    expect(authority).toContain("default-src 'none'");
    expect(authority).toContain("connect-src 'none'");
    expect(authority).toContain("form-action 'none'");
    expect(authority).toContain("data-playsay-game-bridge");
    expect(authority).toContain("document.body.dataset.ready = 'true'");
    expect(authority).toContain("Object.defineProperty(window, 'localStorage'");
    expect(mirror).toContain("const finishPointerDrag");
    expect(mirror).toContain("type: 'dragstart'");
    expect(mirror).toContain("type: 'dragover'");
    expect(mirror).toContain("type: 'drop'");
    expect(mirror).toContain('type="application/playsay-disabled"');
    expect(mirror).toContain("data-playsay-game-bridge");
  });

  it("renders srcdoc in a sandbox without same-origin or navigation permissions", () => {
    const markup = renderToStaticMarkup(
      <HtmlGameFrame blockId="game-1" height={640} html={gameHtml} title="Game" />,
    );

    expect(markup).toContain('sandbox="allow-scripts allow-forms allow-pointer-lock"');
    expect(markup).not.toContain("allow-same-origin");
    expect(markup).not.toContain("allow-top-navigation");
  });

  it("announces a mounted authority run when collaboration finishes connecting", () => {
    const setAuthorityRun = vi.fn();
    const createSync = (ready: boolean): MaterialHtmlGameSync => ({
      authorityRuns: {},
      effects: [],
      inputs: [],
      isAuthority: true,
      publishEffect: vi.fn(),
      publishInput: vi.fn(),
      publishSnapshot: vi.fn(),
      ready,
      setAuthorityRun,
      snapshots: {},
    });
    const { rerender, unmount } = render(
      <HtmlGameFrame blockId="game-1" height={640} html={gameHtml} sync={createSync(false)} title="Game" />,
    );

    expect(setAuthorityRun).not.toHaveBeenCalled();

    rerender(
      <HtmlGameFrame blockId="game-1" height={640} html={gameHtml} sync={createSync(true)} title="Game" />,
    );

    expect(setAuthorityRun).toHaveBeenCalledWith("game-1", expect.any(String));

    unmount();
    expect(setAuthorityRun).toHaveBeenLastCalledWith("game-1", null);
  });
});
