import { X } from "lucide-react";
import type { GamificationEvent } from "../../shared/types";
import { eventLabel, type GamificationEventLabels } from "./gamificationEvents";

export interface GamificationEventQueueLabels extends GamificationEventLabels {
  events: string;
  closeEvent: string;
}

interface Props {
  labels: GamificationEventQueueLabels;
  events: GamificationEvent[];
  onDismiss: (eventId: number) => void;
}

export function GamificationEventQueue({ labels, events, onDismiss }: Props) {
  const event = events[0];
  if (!event) {
    return null;
  }

  return (
    <aside className="gamification-event-queue" aria-live="polite" aria-label={labels.events}>
      <div className="gamification-event-queue__item">
        <span>{labels.events}</span>
        <strong>{eventLabel(event, labels)}</strong>
        <button type="button" className="icon-button" onClick={() => onDismiss(event.id)} aria-label={labels.closeEvent} title={labels.closeEvent}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
