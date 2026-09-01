import { describe, expect, it } from "vitest";
import { classifyMediaTransportReports, classifySelectedTransport } from "./mediaTransportEvidence";

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
