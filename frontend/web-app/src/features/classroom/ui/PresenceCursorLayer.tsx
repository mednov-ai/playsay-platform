import { MousePointer2 } from "lucide-react";
import type { CSSProperties } from "react";
import type { CollaborationParticipant } from "../hooks/useYjsWorkspace";
import type { AnnotationLayerBounds } from "./AnnotationLayer";

export function PresenceCursorLayer({
  anchorBounds,
  anchorId,
  participants,
}: {
  anchorBounds?: AnnotationLayerBounds;
  anchorId?: string;
  participants: CollaborationParticipant[];
}) {
  const visibleParticipants = participants.filter((participant) => (
    participant.cursor && (participant.cursor.anchorId ?? "") === (anchorId ?? "")
  ));

  if (visibleParticipants.length === 0) {
    return null;
  }

  return (
    <div
      className="playsay-presence-layer"
      aria-hidden="true"
      style={anchorBounds ? {
        clipPath: anchorBounds.clipPath,
        bottom: "auto",
        height: `${anchorBounds.height}px`,
        left: `${anchorBounds.left}px`,
        right: "auto",
        top: `${anchorBounds.top}px`,
        width: `${anchorBounds.width}px`,
      } : undefined}
    >
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
