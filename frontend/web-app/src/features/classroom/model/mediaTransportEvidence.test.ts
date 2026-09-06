import { describe, expect, it } from "vitest";
import { classifyMediaTransportReports, classifySelectedTransport, receivedMediaProgress, selectedRegionalRelayMatched } from "./mediaTransportEvidence";

function report(...entries: RTCStats[]): RTCStatsReport {
  const values = new Map(entries.map((entry) => [entry.id, entry]));
  return values as unknown as RTCStatsReport;
}

type CandidateStats = RTCStats & {
  candidateType?: string;
  protocol?: string;
  relayProtocol?: string;
  url?: string;
};

function selectedReport(candidate: Partial<CandidateStats>): RTCStatsReport {
  return report(
    { id: "transport", type: "transport", selectedCandidatePairId: "pair" } as RTCTransportStats,
    {
      id: "pair",
      type: "candidate-pair",
      state: "succeeded",
      nominated: true,
      localCandidateId: "local",
    } as RTCIceCandidatePairStats,
    {
      id: "local",
      type: "local-candidate",
      candidateType: "relay",
      protocol: "udp",
      ...candidate,
    } as CandidateStats,
  );
}

describe("media transport evidence", () => {
  it("requires the exact environment relay endpoint and keeps unavailable evidence unknown", () => {
    const dev = "wss://dev.online.honeyschool.ru/livekit";
    expect(selectedRegionalRelayMatched(selectedReport({ url: "turns:dev.turn.honeyschool.ru:5350?transport=tcp" }), dev)).toBe(true);
    expect(selectedRegionalRelayMatched(selectedReport({ url: "turns:turn.honeyschool.ru:5349?transport=tcp" }), dev)).toBe(false);
    expect(selectedRegionalRelayMatched(selectedReport({}), dev)).toBeNull();
    expect(selectedRegionalRelayMatched(selectedReport({ candidateType: "host" }), dev)).toBe(false);
  });

  it("classifies bounded relay transport classes without retaining candidate addresses", () => {
    expect(classifySelectedTransport(selectedReport({ protocol: "udp" }))).toBe("turn-udp");
    expect(classifySelectedTransport(selectedReport({ protocol: "tcp" }))).toBe("turn-tcp");
    expect(classifySelectedTransport(selectedReport({ protocol: "tcp", url: "turns:prohibited-address" }))).toBe("turn-tls");
    expect(classifySelectedTransport(selectedReport({ candidateType: "host" }))).toBe("direct");
  });

  it("accepts only unanimous relay evidence across active peer connections", () => {
    expect(classifyMediaTransportReports([selectedReport({ protocol: "udp" }), selectedReport({ protocol: "udp" })])).toEqual({
      allRelayed: true,
      peerConnectionCount: 2,
      transportClass: "turn-udp",
    });
    expect(classifyMediaTransportReports([selectedReport({ protocol: "udp" }), selectedReport({ candidateType: "host" })])).toEqual({
      allRelayed: false,
      peerConnectionCount: 2,
      transportClass: "unknown",
    });
  });
});

describe("received media", () => {
  it("requires an increasing inbound counter and forgets removed streams", () => {
    const previous = new Map<string, number>();
    const inbound = (bytes: number) => report({ id: "receiver", type: "inbound-rtp", bytesReceived: bytes } as RTCInboundRtpStreamStats);
    expect(receivedMediaProgress(inbound(100), previous)).toBe(false);
    expect(receivedMediaProgress(inbound(200), previous)).toBe(true);
    expect(receivedMediaProgress(inbound(200), previous)).toBe(false);
    expect(receivedMediaProgress(inbound(10), previous)).toBe(false);
    expect(receivedMediaProgress(report(), previous)).toBe(false);
    expect(previous.size).toBe(0);
    expect(receivedMediaProgress(inbound(500), previous)).toBe(false);
  });
});
