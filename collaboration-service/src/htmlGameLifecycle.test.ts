import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { assertGameLifecycleUpdate, encodeGameLifecycle, isHtmlGameStopMessage, stopHtmlGameRun, stoppedRunsMap } from "./htmlGameLifecycle.js";
function setup() {
  const doc = new Y.Doc();
  doc.getMap("htmlGamePresentation").set("activeBlockId", "game");
  doc.getMap("htmlGamePresentation").set("launchId", "launch-a");
  doc.getMap("htmlGameSnapshots").set("game", { runId: "run-a" });
  const peers = [{ htmlGameStopVersion: 1, htmlGameAuthorities: { game: "run-a" } }, { htmlGameStopVersion: 1 }];
  return { doc, peers, stop: { type: "stop", blockId: "game", runId: "run-a", launchId: "launch-a" } };
}
describe("server-owned HTML game termination", () => {
  it("routes lifecycle stops separately from existing type-3 viewport commands", () => {
    expect(isHtmlGameStopMessage(encodeGameLifecycle(setup().stop))).toBe(true);
    expect(isHtmlGameStopMessage(encodeGameLifecycle({ presentationChanged: true, viewport: { pageId: "page" } }))).toBe(false);
    expect(isHtmlGameStopMessage(encodeGameLifecycle({ type: "result", result: "stopped" }))).toBe(false);
    expect(isHtmlGameStopMessage(new Uint8Array([1]))).toBe(false);
  });

  it("rejects oversized or concatenated command envelopes before dispatch", () => {
    expect(() => isHtmlGameStopMessage(encodeGameLifecycle({ viewport: "x".repeat(16 * 1024) }))).toThrow();
    const frame = encodeGameLifecycle(setup().stop);
    expect(() => isHtmlGameStopMessage(new Uint8Array([...frame, 0]))).toThrow();
  });
  it("accepts participant stop idempotently and persists terminal state without changing answers", () => {
    const { doc, peers, stop } = setup();
    doc.getMap("materialAnswerFields").set("answer", "kept");
    expect(stopHtmlGameRun(doc, peers, stop).result).toBe("stopped");
    expect(stopHtmlGameRun(doc, peers, stop).result).toBe("stopped");
    expect(doc.getMap("htmlGamePresentation").has("activeBlockId")).toBe(false);
    expect(doc.getMap("htmlGameSnapshots").has("game")).toBe(false);
    expect(doc.getMap("materialAnswerFields").get("answer")).toBe("kept");
    const restored = new Y.Doc(); Y.applyUpdate(restored, Y.encodeStateAsUpdate(doc));
    expect(restored.getMap(stoppedRunsMap).get("launch-a")).toBe("game");
    restored.destroy(); doc.destroy();
  });
  it("does not stop a newer launch even before awareness updates", () => {
    const { doc, peers, stop } = setup();
    doc.getMap("htmlGamePresentation").set("launchId", "launch-b");
    expect(stopHtmlGameRun(doc, peers, stop).result).toBe("stale");
    expect(doc.getMap("htmlGamePresentation").get("activeBlockId")).toBe("game"); doc.destroy();
  });
  it("rejects other runs, blocks, oversized requests and mixed client versions", () => {
    const { doc, peers, stop } = setup();
    expect(stopHtmlGameRun(doc, peers, { ...stop, runId: "run-b" }).result).toBe("stale");
    expect(stopHtmlGameRun(doc, peers, { ...stop, blockId: "other" }).result).toBe("stale");
    expect(stopHtmlGameRun(doc, [...peers, {}], stop).result).toBe("incompatible");
    expect(doc.getMap(stoppedRunsMap).size).toBe(0);
    expect(() => stopHtmlGameRun(doc, peers, { ...stop, runId: "x".repeat(201) })).toThrow(); doc.destroy();
  });
  it("prevents sync forging or erasing terminal state while allowing other work", () => {
    const { doc, peers, stop } = setup(); stopHtmlGameRun(doc, peers, stop);
    const replica = new Y.Doc(); Y.applyUpdate(replica, Y.encodeStateAsUpdate(doc));
    const baseline = Y.encodeStateVector(doc);
    replica.getMap("annotations").set("text", "hello");
    expect(() => assertGameLifecycleUpdate(doc, Y.encodeStateAsUpdate(replica, baseline))).not.toThrow();
    replica.getMap(stoppedRunsMap).delete("run-a");
    expect(() => assertGameLifecycleUpdate(doc, Y.encodeStateAsUpdate(replica, baseline))).toThrow("server-owned");
    replica.getMap(stoppedRunsMap).set("forged", "game");
    expect(() => assertGameLifecycleUpdate(doc, Y.encodeStateAsUpdate(replica, baseline))).toThrow("server-owned");
    replica.destroy(); doc.destroy();
  });
  it("isolates workspace documents", () => {
    const a = setup(); const b = setup(); stopHtmlGameRun(a.doc, a.peers, a.stop);
    expect(b.doc.getMap("htmlGamePresentation").get("activeBlockId")).toBe("game");
    a.doc.destroy(); b.doc.destroy();
  });
  it("preserves nested annotation text, ordinary deletions and full snapshot resync", () => {
    const { doc, peers, stop } = setup(); stopHtmlGameRun(doc, peers, stop);
    const replica = new Y.Doc(); Y.applyUpdate(replica, Y.encodeStateAsUpdate(doc));
    const text = new Y.Text("first"); const element = new Y.Map(); element.set("text", text);
    replica.getMap("annotations").set("item", element);
    assertGameLifecycleUpdate(doc, Y.encodeStateAsUpdate(replica));
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(replica));
    text.delete(0, 1); text.insert(0, "new");
    expect(() => assertGameLifecycleUpdate(doc, Y.encodeStateAsUpdate(replica))).not.toThrow();
    replica.getMap("annotations").delete("item");
    expect(() => assertGameLifecycleUpdate(doc, Y.encodeStateAsUpdate(replica))).not.toThrow();
    replica.destroy(); doc.destroy();
  });

  it("stops a requested launch and ignores terminated checkpoints after host disconnect", () => {
    const { doc, peers, stop } = setup(); stopHtmlGameRun(doc, peers, stop);
    doc.getMap("htmlGamePresentation").set("activeBlockId", "game");
    doc.getMap("htmlGamePresentation").set("launchId", "launch-b");
    doc.getMap("htmlGameSdkCheckpoints").set("game", {runId:"run-a"});
    expect(stopHtmlGameRun(doc, [{htmlGameStopVersion:1}], {...stop,runId:"run-b",launchId:"launch-b"}).result).toBe("stopped");
    expect(doc.getMap(stoppedRunsMap).get("launch-b")).toBe("game");doc.destroy();
  });

});
