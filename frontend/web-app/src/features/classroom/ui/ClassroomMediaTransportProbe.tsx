import { useRoomContext } from "@livekit/components-react";
import { useEffect } from "react";
import { classifyMediaTransportReports, type MediaTransportEvidence } from "../model/mediaTransportEvidence";

export function ClassroomMediaTransportProbe({
  onEvidence,
}: {
  onEvidence: (evidence: MediaTransportEvidence) => void;
}) {
  const room = useRoomContext();

  useEffect(() => {
    let stopped = false;
    let collecting = false;

    async function collect() {
      if (stopped || collecting) return;
      collecting = true;
      try {
        const manager = room.engine?.pcManager;
        if (!manager) {
          if (!stopped) onEvidence({ allRelayed: false, peerConnectionCount: 0, transportClass: "unknown" });
          return;
        }
        const transports = [manager.publisher, manager.subscriber].filter((transport) => transport !== undefined);
        const reports = await Promise.all(transports.map((transport) => transport.getStats()));
        if (!stopped) onEvidence(classifyMediaTransportReports(reports));
      } catch {
        if (!stopped) onEvidence({ allRelayed: false, peerConnectionCount: 0, transportClass: "unknown" });
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
  }, [onEvidence, room]);

  return null;
}
