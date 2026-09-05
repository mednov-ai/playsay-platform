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
  const localCandidate = selectedLocalCandidate(report);
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

export function selectedRegionalRelayMatched(report: RTCStatsReport, serverUrl: string): boolean | null {
  const candidate = selectedLocalCandidate(report);
  if (!candidate) return null;
  if (candidate.candidateType !== "relay") return false;
  if (!candidate.url) return null;
  const expected = serverUrl === "wss://dev.online.honeyschool.ru/livekit"
    ? ["turn:dev.turn.honeyschool.ru:3479?transport=udp", "turn:dev.turn.honeyschool.ru:3479?transport=tcp", "turns:dev.turn.honeyschool.ru:5350?transport=tcp"]
    : serverUrl === "wss://online.honeyschool.ru/livekit"
      ? ["turn:turn.honeyschool.ru:3478?transport=udp", "turn:turn.honeyschool.ru:3478?transport=tcp", "turns:turn.honeyschool.ru:5349?transport=tcp"]
      : [];
  return expected.includes(candidate.url.toLowerCase());
}

function selectedLocalCandidate(report: RTCStatsReport): CandidateStats | undefined {
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
  if (!pair?.localCandidateId) return undefined;
  const localCandidate = stats.get(pair.localCandidateId) as CandidateStats | undefined;
  return localCandidate;
}

// Only transient counters stay in memory; no stats identifiers enter telemetry.
export function receivedMediaProgress(report: RTCStatsReport, previous: Map<string, number>): boolean {
  const next = new Map<string, number>();
  let receiving = false;
  report.forEach((value) => {
    if (value.type !== "inbound-rtp" || typeof value.bytesReceived !== "number" || !Number.isFinite(value.bytesReceived)) return;
    const before = previous.get(value.id);
    next.set(value.id, value.bytesReceived);
    if (before !== undefined && value.bytesReceived > before) receiving = true;
  });
  previous.clear();
  next.forEach((bytes, id) => previous.set(id, bytes));
  return receiving;
}
