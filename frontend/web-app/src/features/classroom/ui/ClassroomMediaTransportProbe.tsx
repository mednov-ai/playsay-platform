import { useRoomContext } from "@livekit/components-react";
import { useEffect } from "react";
import { classifyMediaTransportReports, receivedMediaProgress, selectedRegionalRelayMatched, type MediaTransportEvidence } from "../model/mediaTransportEvidence";
import { reportRegionalRouteDiagnostic, type RegionalRouteDiagnosticEvent } from "../../../shared/api/regionalRouteDiagnostics";

export function ClassroomMediaTransportProbe({
  onEvidence,
  serverUrl,
}: {
  onEvidence: (evidence: MediaTransportEvidence) => void;
  serverUrl: string;
}) {
  const room = useRoomContext();

  useEffect(() => {
    let stopped = false;
    let collecting = false;
    const lastFingerprints = new Map<string, string>();
    const receivedCounters = new Map<string, number>();
    const attemptId = window.crypto.randomUUID();

    function publish(role: "PUBLISHER" | "SUBSCRIBER", evidence: MediaTransportEvidence, report: RTCStatsReport) {
      const event: RegionalRouteDiagnosticEvent = {
        attemptId,
        stage: "ICE",
        outcome: evidence.transportClass === "unknown" ? "UNAVAILABLE" : "SUCCESS",
        connectionRole: role,
        regionalEndpointMatched: selectedRegionalRelayMatched(report, serverUrl),
        transportClass: evidence.transportClass.replace("-", "_").toUpperCase() as RegionalRouteDiagnosticEvent["transportClass"],
      };
      emit(event);
      if (role === "SUBSCRIBER") {
        emit({ ...event, stage: "MEDIA", outcome: receivedMediaProgress(report, receivedCounters) ? "SUCCESS" : "UNAVAILABLE" });
      }
    }

    function emit(event: RegionalRouteDiagnosticEvent) {
      const key = `${event.connectionRole}:${event.stage}`;
      const fingerprint = JSON.stringify(event);
      if (fingerprint !== lastFingerprints.get(key)) {
        lastFingerprints.set(key, fingerprint);
        void reportRegionalRouteDiagnostic(event);
      }
    }

    function unavailable() {
      receivedCounters.clear();
      onEvidence({ allRelayed: false, peerConnectionCount: 0, transportClass: "unknown" });
      for (const stage of ["ICE", "MEDIA"] as const) {
        emit({ attemptId, stage, outcome: "UNAVAILABLE", connectionRole: "SUBSCRIBER", regionalEndpointMatched: null, transportClass: "UNKNOWN" });
      }
    }

    async function collect() {
      if (stopped || collecting) return;
      collecting = true;
      try {
        const manager = room.engine?.pcManager;
        if (!manager) {
          if (!stopped) unavailable();
          return;
        }
        const transports = [
          ["PUBLISHER", manager.publisher],
          ["SUBSCRIBER", manager.subscriber],
        ].filter((entry) => entry[1] !== undefined) as Array<["PUBLISHER" | "SUBSCRIBER", { getStats: () => Promise<RTCStatsReport> }]>;
        const reports = await Promise.all(transports.map(([, transport]) => transport.getStats()));
        if (!stopped) {
          onEvidence(classifyMediaTransportReports(reports));
          reports.forEach((report, index) => publish(transports[index][0], classifyMediaTransportReports([report]), report));
        }
      } catch {
        if (!stopped) unavailable();
      } finally {
        collecting = false;
      }
    }

    void collect();
    const intervalId = window.setInterval(() => void collect(), 5_000);
    return () => {
      stopped = true;
      window.clearInterval(intervalId);
    };
  }, [onEvidence, room, serverUrl]);

  return null;
}
