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

    async function collect() {
      try {
        const manager = room.engine?.pcManager;
        if (!manager) return;
        const transports = [manager.publisher, manager.subscriber].filter((transport) => transport !== undefined);
        const reports = await Promise.all(transports.map((transport) => transport.getStats()));
        if (!stopped) onEvidence(classifyMediaTransportReports(reports));
      } catch {
        if (!stopped) onEvidence({ allRelayed: false, peerConnectionCount: 0, transportClass: "unknown" });
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
