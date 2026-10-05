// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as sync from "y-protocols/sync";
import { createYjsWorkspaceRuntime } from "./yjsRuntime";
import type { MaterialHtmlGameLifecycle } from "../../materials/model/materialDocument";
function lifecycleFrame(payload: unknown) {
  const encoder = encoding.createEncoder(); encoding.writeVarUint(encoder, 3);
  encoding.writeVarString(encoder, JSON.stringify(payload)); return encoding.toUint8Array(encoder);
}
function setup() {
  let state: MaterialHtmlGameLifecycle = { stoppedRuns: {}, requests: {} };
  const runtime = createYjsWorkspaceRuntime({ color:"#fff",participantName:"Teacher",onAnnotationChange:()=>{},onHtmlGameEffectsChange:()=>{},onHtmlGameInputsChange:()=>{},onHtmlGameSnapshotsChange:()=>{},onParticipantsChange:()=>{},onTextChange:()=>{},onHtmlGameLifecycleChange:value=>state=value });
  return { runtime, get state() { return state; } };
}
function socket() {
  return { readyState:WebSocket.OPEN, send:vi.fn() } as unknown as WebSocket & {send:ReturnType<typeof vi.fn>};
}
describe("game stop lifecycle client", () => {
  it("retains offline stop identity and sends it only after a capable reconnect greeting", () => {
    const app=setup();app.runtime.stopHtmlGameRun("game","run-a","launch-a");
    expect(app.state.requests.game.phase).toBe("pending");
    const connected=socket();app.runtime.setSocket(connected);
    expect(connected.send).not.toHaveBeenCalled();
    app.runtime.handleSocketMessage(lifecycleFrame({type:"hello",version:1}));
    const decoder=decoding.createDecoder(connected.send.mock.calls[0][0]);
    expect(decoding.readVarUint(decoder)).toBe(3);
    expect(JSON.parse(decoding.readVarString(decoder))).toEqual({type:"stop",blockId:"game",runId:"run-a",launchId:"launch-a"});
    app.runtime.destroy();
  });
  it("clears pending on canonical terminal state and preserves it through snapshot restoration", () => {
    const app=setup();app.runtime.stopHtmlGameRun("game","run-a","launch-a");
    const doc=new Y.Doc();doc.getMap("htmlGameStoppedRuns").set("run-a","game");doc.getMap("htmlGameStoppedRuns").set("launch-a","game");
    const encoder=encoding.createEncoder();encoding.writeVarUint(encoder,0);sync.writeUpdate(encoder,Y.encodeStateAsUpdate(doc));
    app.runtime.handleSocketMessage(encoding.toUint8Array(encoder));
    expect(app.state.requests).toEqual({});expect(app.state.stoppedRuns['launch-a']).toBe("game");
    const snapshot=app.runtime.snapshot();app.runtime.destroy();doc.destroy();
    let restored:MaterialHtmlGameLifecycle|undefined;
    const runtime=createYjsWorkspaceRuntime({color:"#fff",participantName:"Learner",snapshot,onAnnotationChange:()=>{},onHtmlGameEffectsChange:()=>{},onHtmlGameInputsChange:()=>{},onHtmlGameSnapshotsChange:()=>{},onParticipantsChange:()=>{},onTextChange:()=>{},onHtmlGameLifecycleChange:value=>restored=value});
    expect(restored?.stoppedRuns['run-a']).toBe("game");runtime.destroy();
  });
  it("does not confirm an old server or clear a newer pending request with an old result", () => {
    const app=setup();const connected=socket();app.runtime.setSocket(connected);
    app.runtime.stopHtmlGameRun("game","run-a","launch-a");
    expect(app.state.requests.game.phase).toBe("incompatible");expect(connected.send).not.toHaveBeenCalled();
    app.runtime.handleSocketMessage(lifecycleFrame({type:"hello",version:1}));
    app.runtime.stopHtmlGameRun("game","run-b","launch-b");
    app.runtime.handleSocketMessage(lifecycleFrame({type:"result",blockId:"game",runId:"run-a",result:"stopped"}));
    expect(app.state.requests.game.runId).toBe("run-b");
    app.runtime.handleSocketMessage(lifecycleFrame({type:"result",blockId:"game",runId:"run-b",result:"incompatible"}));
    expect(app.state.requests.game.phase).toBe("incompatible");app.runtime.destroy();
  });
});
