// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }

import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import type { MaterialHtmlGameSync } from "../../model/materialDocument";
import { HtmlGameFrame, createSandboxedGameDocument } from "./HtmlGameFrame";

vi.mock("../../../../shared/i18n", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

const gameHtml = "<html><head><title>Game</title></head><body><button id=\"start\">Start</button><script>document.body.dataset.ready = 'true'</script></body></html>";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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
    expect(mirror).toContain("type: 'ready'");
    expect(mirror).toContain("type: 'snapshotApplied'");
    expect(mirror).toContain("pointerMoveIntervalMs = 1000 / 30");
    expect(mirror).toContain("schedulePointerMove(event)");
    expect(mirror).toContain("relativeX");
    expect(mirror).toContain("relativeY");
    expect(mirror).toContain('type="application/playsay-disabled"');
    expect(mirror).toContain("data-playsay-game-bridge");
    expect(authority).toContain("lastSnapshotHtml");
    expect(authority).toContain("canvasSnapshotIntervalMs = 250");
    expect(authority).toContain("maxCanvasDataUrlLength = 150 * 1024");
    expect(authority).toContain("'image/webp'");
    expect(authority).toContain("dataUrl.length <= maxCanvasDataUrlLength ? dataUrl : ''");
    expect(authority).toContain("snapshotInFlight");
    expect(authority).toContain("meaningfulInput ? 0 : continuousInput ? 50 : 250");
    expect(authority).toContain("continuousInput ? canvasSnapshotIntervalMs : 500");
    expect(authority).toContain("'beforeinput', 'input', 'change', 'focus', 'blur'");
    expect(authority).toContain("serializeControls");
    expect(authority).toContain("serializeCanvases");
    expect(authority).toContain("applyFormState(target, input)");
    expect(authority).not.toContain("}, 120)");
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
      presentedBlockId: null,
      publishEffect: vi.fn(),
      publishInput: vi.fn(),
      publishSnapshot: vi.fn(),
      ready,
      setAuthorityRun,
      setPresentedBlock: vi.fn(),
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

  it("does not replay delayed input history into a newly restarted authority", () => {
    const setAuthorityRun = vi.fn();
    const createSync = (inputs: MaterialHtmlGameSync["inputs"]): MaterialHtmlGameSync => ({
      authorityRuns: {},
      effects: [],
      inputs,
      isAuthority: true,
      presentedBlockId: null,
      publishEffect: vi.fn(),
      publishInput: vi.fn(),
      publishSnapshot: vi.fn(),
      ready: true,
      setAuthorityRun,
      setPresentedBlock: vi.fn(),
      snapshots: {},
    });
    const { container, rerender } = render(
      <HtmlGameFrame blockId="game-1" height={640} html={gameHtml} sync={createSync([])} title="Game" />,
    );
    const iframeWindow = container.querySelector("iframe")?.contentWindow;
    expect(iframeWindow).not.toBeNull();
    const postMessage = vi.spyOn(iframeWindow!, "postMessage");
    const currentRunId = setAuthorityRun.mock.calls.find((call) => call[1] !== null)?.[1];
    expect(currentRunId).toEqual(expect.any(String));

    rerender(
      <HtmlGameFrame
        blockId="game-1"
        height={640}
        html={gameHtml}
        sync={createSync([{ at: 900, blockId: "game-1", id: "old", runId: "old-run", targetId: "__document__", type: "click" }])}
        title="Game"
      />,
    );

    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "applyInput" }), "*");

    rerender(
      <HtmlGameFrame
        blockId="game-1"
        height={640}
        html={gameHtml}
        sync={createSync([
          { at: 900, blockId: "game-1", id: "old", runId: "old-run", targetId: "__document__", type: "click" },
          { at: 1_100, blockId: "game-1", id: "new", runId: currentRunId, targetId: "__document__", type: "click" },
        ])}
        title="Game"
      />,
    );

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ event: expect.objectContaining({ id: "new" }), type: "applyInput" }), "*");
  });

  it("waits for mirror readiness and acknowledgement before exposing the game", () => {
    vi.useFakeTimers();
    const firstSnapshot = {
      html: '<body data-playsay-node-id="1"><div data-playsay-node-id="2">Ready</div></body>',
      runId: "authority-run",
      sequence: 1,
      updatedAt: 100,
    };
    const createMirrorSync = (snapshot = firstSnapshot): MaterialHtmlGameSync => ({
      authorityRuns: { "game-1": "authority-run" },
      effects: [],
      inputs: [],
      isAuthority: false,
      presentedBlockId: "game-1",
      publishEffect: vi.fn(),
      publishInput: vi.fn(),
      publishSnapshot: vi.fn(),
      ready: true,
      setAuthorityRun: vi.fn(),
      setPresentedBlock: vi.fn(),
      snapshots: { "game-1": snapshot },
    });
    const { container, rerender } = render(
      <HtmlGameFrame blockId="game-1" height={640} html={gameHtml} sync={createMirrorSync()} title="Game" />,
    );
    const iframe = container.querySelector("iframe");
    const iframeWindow = iframe?.contentWindow;
    expect(iframeWindow).not.toBeNull();
    const postMessage = vi.spyOn(iframeWindow!, "postMessage");
    const channelMatch = iframe?.getAttribute("srcdoc")?.match(/const channel = ("[^"]+");/);
    const channel = channelMatch ? JSON.parse(channelMatch[1]) as string : "";
    expect(channel).not.toBe("");
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "applySnapshot" }), "*");
    expect(container.querySelector(".playsay-html-game-waiting")).not.toBeNull();

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { channel, mirror: true, type: "ready" },
        source: iframeWindow,
      }));
    });

    expect(postMessage).toHaveBeenCalledWith({
      channel,
      snapshot: firstSnapshot,
      type: "applySnapshot",
    }, "*");
    expect(container.querySelector(".playsay-html-game-waiting")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(750);
    });
    expect(postMessage.mock.calls.filter(([message]) => (
      (message as { type?: string }).type === "applySnapshot"
    ))).toHaveLength(2);

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { channel, runId: "stale-run", sequence: 1, type: "snapshotApplied" },
        source: iframeWindow,
      }));
    });
    expect(container.querySelector(".playsay-html-game-waiting")).not.toBeNull();

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        data: { channel, runId: "authority-run", sequence: 1, type: "snapshotApplied" },
        source: iframeWindow,
      }));
    });
    expect(container.querySelector(".playsay-html-game-waiting")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(postMessage.mock.calls.filter(([message]) => (
      (message as { type?: string }).type === "applySnapshot"
    ))).toHaveLength(2);

    const nextSnapshot = { ...firstSnapshot, sequence: 2, updatedAt: 200 };
    rerender(
      <HtmlGameFrame blockId="game-1" height={640} html={gameHtml} sync={createMirrorSync(nextSnapshot)} title="Game" />,
    );
    expect(postMessage).toHaveBeenLastCalledWith({
      channel,
      snapshot: nextSnapshot,
      type: "applySnapshot",
    }, "*");
    expect(container.querySelector(".playsay-html-game-waiting")).toBeNull();
  });

  it("applies dynamic DOM and canvas state before acknowledging a mirror snapshot", async () => {
    const channel = "mirror-bridge-test";
    const messages: Array<Record<string, unknown>> = [];
    const clearRect = vi.fn();
    const drawImage = vi.fn();
    const documentHtml = createSandboxedGameDocument(
      "<html><head><title>Game</title></head><body><div id=\"dynamic\"></div><canvas id=\"surface\" width=\"20\" height=\"10\"></canvas><script>document.querySelector('#dynamic').textContent = 'authority only'</script></body></html>",
      channel,
      true,
    );
    const dom = new JSDOM(documentHtml, {
      pretendToBeVisual: true,
      runScripts: "dangerously",
      url: "http://localhost/",
      beforeParse(window) {
        window.addEventListener("message", (event) => {
          const message = event.data as Record<string, unknown>;
          if (message?.channel === channel) messages.push(message);
        });
        Object.defineProperty(window.HTMLCanvasElement.prototype, "getContext", {
          configurable: true,
          value: () => ({ clearRect, drawImage }),
        });
        Object.defineProperty(window, "CSS", {
          configurable: true,
          value: { escape: (value: string) => value },
        });
        class LoadedPointerEvent extends window.MouseEvent {
          readonly isPrimary: boolean;
          readonly pointerId: number;
          readonly pointerType: string;

          constructor(type: string, init: PointerEventInit = {}) {
            super(type, init);
            this.isPrimary = init.isPrimary ?? true;
            this.pointerId = init.pointerId ?? 1;
            this.pointerType = init.pointerType ?? "mouse";
          }
        }
        Object.defineProperty(window, "PointerEvent", {
          configurable: true,
          value: LoadedPointerEvent,
        });
        class LoadedImage {
          onerror: (() => void) | null = null;
          onload: (() => void) | null = null;

          set src(_value: string) {
            window.queueMicrotask(() => this.onload?.());
          }
        }
        Object.defineProperty(window, "Image", { configurable: true, value: LoadedImage });
      },
    });

    try {
      await waitFor(() => expect(messages.some((message) => message.type === "ready")).toBe(true));
      dom.window.postMessage({
        channel,
        snapshot: {
          canvases: { "snapshot-canvas": "data:image/webp;base64,AA==" },
          html: '<body data-playsay-node-id="snapshot-body"><div id="dynamic" data-playsay-node-id="snapshot-dynamic">snapshot ready</div><canvas id="surface" width="20" height="10" data-playsay-node-id="snapshot-canvas"></canvas></body>',
          runId: "authority-run",
          sequence: 7,
        },
        type: "applySnapshot",
      }, "*");

      await waitFor(() => expect(messages).toContainEqual(expect.objectContaining({
        runId: "authority-run",
        sequence: 7,
        type: "snapshotApplied",
      })));
      expect(dom.window.document.querySelector("#dynamic")?.textContent).toBe("snapshot ready");
      expect(clearRect).toHaveBeenCalledWith(0, 0, 20, 10);
      expect(drawImage).toHaveBeenCalled();

      const surface = dom.window.document.querySelector<HTMLCanvasElement>("#surface");
      expect(surface).not.toBeNull();
      surface!.getBoundingClientRect = () => dom.window.DOMRect.fromRect({
        height: 50,
        width: 100,
        x: 10,
        y: 20,
      });
      surface!.dispatchEvent(new dom.window.PointerEvent("pointerdown", {
        bubbles: true,
        buttons: 1,
        clientX: 20,
        clientY: 25,
        pointerId: 4,
        pointerType: "pen",
      }));
      for (let index = 0; index < 12; index += 1) {
        surface!.dispatchEvent(new dom.window.PointerEvent("pointermove", {
          bubbles: true,
          buttons: 1,
          clientX: 60,
          clientY: 45,
          pointerId: 4,
          pointerType: "pen",
        }));
      }
      surface!.dispatchEvent(new dom.window.PointerEvent("pointerup", {
        bubbles: true,
        clientX: 60,
        clientY: 45,
        pointerId: 4,
        pointerType: "pen",
      }));

      await waitFor(() => expect(messages.some((message) => {
        const event = message.event as Record<string, unknown> | undefined;
        return message.type === "input" && event?.type === "pointermove";
      })).toBe(true));
      const pointerMoves = messages.filter((message) => {
        const event = message.event as Record<string, unknown> | undefined;
        return message.type === "input" && event?.type === "pointermove";
      });
      expect(pointerMoves).toHaveLength(1);
      expect(pointerMoves[0]?.event).toEqual(expect.objectContaining({
        pointerId: 4,
        pointerType: "pen",
        relativeX: 0.5,
        relativeY: 0.5,
        type: "pointermove",
      }));
    } finally {
      dom.window.close();
    }
  });
});
