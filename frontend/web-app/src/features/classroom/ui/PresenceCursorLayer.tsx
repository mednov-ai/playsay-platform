import { MousePointer2 } from "lucide-react";
import type { CSSProperties } from "react";
import type { CollaborationParticipant } from "../hooks/useYjsWorkspace";

export function PresenceCursorLayer({
  participants,
}: {
  participants: CollaborationParticipant[];
}) {
  const visibleParticipants = participants.filter((participant) => participant.cursor);

  if (visibleParticipants.length === 0) {
    return null;
  }

  return (
    <div className="playsay-presence-layer" aria-hidden="true">
      {visibleParticipants.map((participant) => {
        const cursor = participant.cursor!;
        return (
          <div
            className="playsay-presence-cursor"
            key={participant.clientId}
            style={{
              "--presence-color": participant.color,
              left: `${cursor.x * 100}%`,
              top: `${cursor.y * 100}%`,
            } as CSSProperties}
          >
            <MousePointer2 className="h-4 w-4" />
            <span>{participant.name}</span>
          </div>
        );
      })}
    </div>
  );
}
