// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reportRegionalRouteDiagnostic } from "../../../shared/api/regionalRouteDiagnostics";
import { ClassroomMediaTransportProbe } from "./ClassroomMediaTransportProbe";

const state = vi.hoisted(() => ({ room: { engine: { pcManager: undefined as unknown } } }));
vi.mock("@livekit/components-react", () => ({ useRoomContext: () => state.room }));
vi.mock("../../../shared/api/regionalRouteDiagnostics", () => ({ reportRegionalRouteDiagnostic: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); cleanup(); vi.useRealTimers(); state.room.engine.pcManager = undefined; });

function stats(bytesReceived: number): RTCStatsReport {
  return new Map([
    ["transport", { id: "transport", type: "transport", selectedCandidatePairId: "pair" }],
    ["pair", { id: "pair", type: "candidate-pair", state: "succeeded", nominated: true, localCandidateId: "local" }],
    ["local", { id: "local", type: "local-candidate", candidateType: "relay", protocol: "udp", url: "turn:dev.turn.honeyschool.ru:3479?transport=udp" }],
    ["inbound", { id: "inbound", type: "inbound-rtp", bytesReceived }],
  ]) as unknown as RTCStatsReport;
}

describe("classroom media transport probe", () => {
  it("clears evidence when the connection manager is absent", async () => {
    const onEvidence = vi.fn();
    render(<ClassroomMediaTransportProbe onEvidence={onEvidence} serverUrl="wss://dev.livekit.honeyschool.ru" />);
    expect(onEvidence).toHaveBeenCalledWith({ allRelayed: false, peerConnectionCount: 0, transportClass: "unknown" });
  });

  it("does not overlap polls or publish a result after unmount", async () => {
    vi.useFakeTimers();
    let resolveStats!: (stats: RTCStatsReport) => void;
    const getStats = vi.fn(() => new Promise<RTCStatsReport>((resolve) => { resolveStats = resolve; }));
    state.room.engine.pcManager = { publisher: { getStats } };
    const onEvidence = vi.fn();
    const view = render(<ClassroomMediaTransportProbe onEvidence={onEvidence} serverUrl="wss://dev.livekit.honeyschool.ru" />);
    await act(async () => { vi.advanceTimersByTime(15_000); });
    expect(getStats).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => { resolveStats(new Map() as unknown as RTCStatsReport); });
    expect(onEvidence).not.toHaveBeenCalled();
  });
  it("observes both flows and received bytes without counting the connection twice", async () => {
    vi.useFakeTimers();
    const getStats = vi.fn().mockResolvedValueOnce(stats(100)).mockResolvedValue(stats(200));
    state.room.engine.pcManager = { publisher: { getStats } };
    const onEvidence = vi.fn();
    const view = render(<ClassroomMediaTransportProbe onEvidence={onEvidence} serverUrl="wss://dev.online.honeyschool.ru/livekit" />);
    await act(async () => { await Promise.resolve(); });
    expect(onEvidence).toHaveBeenCalledWith(expect.objectContaining({ peerConnectionCount: 1, allRelayed: true }));
    for (const connectionRole of ["PUBLISHER", "SUBSCRIBER"]) {
      expect(reportRegionalRouteDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ stage: "ICE", connectionRole, regionalEndpointMatched: true }));
    }
    expect(reportRegionalRouteDiagnostic).not.toHaveBeenCalledWith(expect.objectContaining({ stage: "MEDIA", outcome: "SUCCESS" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(reportRegionalRouteDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ stage: "MEDIA", connectionRole: "SUBSCRIBER", outcome: "SUCCESS" }));
    expect(getStats).toHaveBeenCalledTimes(2);
    view.unmount();
  });
});
