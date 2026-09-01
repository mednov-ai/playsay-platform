export type MediaTransportClass = "direct" | "turn-udp" | "turn-tcp" | "turn-tls" | "unknown";

export type MediaTransportEvidence = {
  allRelayed: boolean;
  peerConnectionCount: number;
  transportClass: MediaTransportClass;
};

type CandidateStats = RTCStats & {
  candidateType?: string;
  protocol?: string;
  relayProtocol?: string;
  url?: string;
};

export function classifyMediaTransportReports(reports: RTCStatsReport[]): MediaTransportEvidence {
  const classes = reports.map(classifySelectedTransport);
  const knownClasses = classes.filter((value) => value !== "unknown");
  const relayClasses = knownClasses.filter((value) => value.startsWith("turn-"));
  const uniqueClasses = new Set(knownClasses);

  return {
    allRelayed: reports.length > 0 && knownClasses.length === reports.length && relayClasses.length === reports.length,
    peerConnectionCount: reports.length,
    transportClass: uniqueClasses.size === 1 ? knownClasses[0] ?? "unknown" : "unknown",
  };
}

export function classifySelectedTransport(report: RTCStatsReport): MediaTransportClass {
  const stats = new Map<string, RTCStats>();
  let selectedPairId: string | undefined;
  let selectedPair: RTCIceCandidatePairStats | undefined;

  report.forEach((value) => {
    stats.set(value.id, value);
    if (value.type === "transport" && typeof value.selectedCandidatePairId === "string") {
      selectedPairId = value.selectedCandidatePairId;
    }
    if (
      value.type === "candidate-pair"
      && value.state === "succeeded"
      && (value.selected === true || value.nominated === true)
    ) {
      selectedPair = value as RTCIceCandidatePairStats;
    }
  });

  const pair = (selectedPairId ? stats.get(selectedPairId) : selectedPair) as RTCIceCandidatePairStats | undefined;
  if (!pair?.localCandidateId) return "unknown";
  const localCandidate = stats.get(pair.localCandidateId) as CandidateStats | undefined;
  if (!localCandidate) return "unknown";
  if (localCandidate.candidateType !== "relay") return "direct";

  const relayProtocol = String(localCandidate.relayProtocol ?? "").toLowerCase();
  const protocol = String(localCandidate.protocol ?? "").toLowerCase();
  const candidateUrl = String(localCandidate.url ?? "").toLowerCase();
  if (relayProtocol === "tls" || candidateUrl.startsWith("turns:")) return "turn-tls";
  if (relayProtocol === "tcp" || protocol === "tcp") return "turn-tcp";
  if (relayProtocol === "udp" || protocol === "udp") return "turn-udp";
  return "unknown";
}
