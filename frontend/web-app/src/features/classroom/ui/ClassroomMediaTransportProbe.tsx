import { observeConnection } from "../../../shared/routing/connectionDiagnostics";
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
      const received = role === "SUBSCRIBER" ? receivedMediaProgress(report, receivedCounters) : null;
      observeConnection(role === "PUBLISHER" ? "publisher" : "subscriber", serverUrl, event.outcome === "SUCCESS", { transport: evidence.transportClass, relayMatched: event.regionalEndpointMatched, received });
      emit(event);
      if (role === "SUBSCRIBER") {
        emit({ ...event, stage: "MEDIA", outcome: received ? "SUCCESS" : "UNAVAILABLE" });
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
      observeConnection("publisher", serverUrl, false);
      observeConnection("subscriber", serverUrl, false);
      onEvidence({ allRelayed: false, peerConnectionCount: 0, transportClass: "unknown" });
      for (const stage of ["ICE", "MEDIA"] as const) {
        emit({ attemptId, stage, outcome: "UNAVAILABLE", connectionRole: "SUBSCRIBER", regionalEndpointMatched: null, transportClass: "UNKNOWN" });
      }
    }

    async function collect() {
      if (stopped || collecting) return;
      collecting = true;
      try {
        observeConnection("signaling", serverUrl, room.state === "connected");
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
          reports.forEach((report, index) => {
            const role = transports[index][0];
            const evidence = classifyMediaTransportReports([report]);
            publish(role, evidence, report);
            // LiveKit publisher-only mode carries both outbound and inbound RTP
            // on one connection. Count that connection once, but inspect both flows.
            if (role === "PUBLISHER" && !manager.subscriber) {
              publish("SUBSCRIBER", evidence, report);
            }
          });
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
      observeConnection("signaling", serverUrl, false);
      observeConnection("publisher", serverUrl, false);
      observeConnection("subscriber", serverUrl, false);
      window.clearInterval(intervalId);
    };
  }, [onEvidence, room, serverUrl]);

  return null;
}
