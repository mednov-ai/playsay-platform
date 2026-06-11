import { X } from "lucide-react";
import { useEffect } from "react";
import type { GamificationEvent } from "../../shared/types";
import { AchievementBadgeArt, achievementInfo, type AchievementCatalogLabels } from "./achievementCatalog";
import { eventLabel, format, type GamificationEventLabels } from "./gamificationEvents";

export interface AchievementCelebrationLabels extends GamificationEventLabels, AchievementCatalogLabels {
  events: string;
  closeEvent: string;
}

interface Props {
  labels: AchievementCelebrationLabels;
  events: GamificationEvent[];
  paused: boolean;
  onDismiss: (eventId: number) => void;
}

export function AchievementCelebrationQueue({ labels, events, paused, onDismiss }: Props) {
  const event = events[0];

  useEffect(() => {
    if (!event || paused) {
      return undefined;
    }
    const timeoutId = window.setTimeout(() => onDismiss(event.id), 4_400);
    return () => window.clearTimeout(timeoutId);
  }, [event, onDismiss, paused]);

  if (!event || paused) {
    return null;
  }

  const details = celebrationDetails(event, labels);

  return (
    <aside className="achievement-celebration" aria-live="polite" aria-label={labels.events}>
      <div className="achievement-celebration__card">
        <span className="achievement-celebration__shine" aria-hidden="true" />
        <span className="achievement-celebration__confetti" aria-hidden="true" />
        <AchievementBadgeArt code={details.badgeCode} />
        <div>
          <span>{labels.events}</span>
          <strong>{details.title}</strong>
          {details.description ? <p>{details.description}</p> : null}
        </div>
        <button type="button" className="icon-button" onClick={() => onDismiss(event.id)} aria-label={labels.closeEvent} title={labels.closeEvent}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

function celebrationDetails(event: GamificationEvent, labels: AchievementCelebrationLabels) {
  if (event.type === "ACHIEVEMENT_UNLOCKED") {
    const code = event.payload.code ?? "UNKNOWN";
    const info = achievementInfo(code, labels);
    return {
      badgeCode: code,
      title: format(labels.achievementUnlocked, { title: info.title, code }),
      description: info.description,
    };
  }
  if (event.type === "MASTERY_UP") {
    return {
      badgeCode: "FIRST_HUNDRED",
      title: eventLabel(event, labels),
      description: "",
    };
  }
  if (event.type === "CALIBRATION_COMPLETE") {
    return {
      badgeCode: "SNIPER",
      title: eventLabel(event, labels),
      description: "",
    };
  }
  if (event.type === "LEAGUE_PROGRESS") {
    return {
      badgeCode: "STREAK_30",
      title: eventLabel(event, labels),
      description: "",
    };
  }
  return {
    badgeCode: "UNKNOWN",
    title: eventLabel(event, labels),
    description: labels.prizeHook,
  };
}
