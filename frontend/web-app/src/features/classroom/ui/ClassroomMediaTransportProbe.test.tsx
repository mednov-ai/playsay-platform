// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassroomMediaTransportProbe } from "./ClassroomMediaTransportProbe";

const state = vi.hoisted(() => ({ room: { engine: { pcManager: undefined as unknown } } }));
vi.mock("@livekit/components-react", () => ({ useRoomContext: () => state.room }));
vi.mock("../../../shared/api/regionalRouteDiagnostics", () => ({ reportRegionalRouteDiagnostic: vi.fn() }));
afterEach(() => { cleanup(); vi.useRealTimers(); state.room.engine.pcManager = undefined; });

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
});
