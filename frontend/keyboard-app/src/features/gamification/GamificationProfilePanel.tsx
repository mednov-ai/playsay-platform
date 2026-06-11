import { GamificationPanel, type GamificationPanelLabels } from "./GamificationPanel";
import type { GamificationProfile } from "../../shared/types";

export interface GamificationProfileLabels extends GamificationPanelLabels {
  profileTitle: string;
  profileIntro: string;
  currentMastery: string;
}

interface Props {
  labels: GamificationProfileLabels;
  units: {
    cpm: string;
  };
  gamification?: GamificationProfile | null;
}

export function GamificationProfilePanel({ labels, units, gamification }: Props) {
  const mastery = gamification?.masteryCpm ?? 0;

  return (
    <div className="gamification-profile" role="document">
      <div className="gamification-profile__hero">
        <span>{labels.profileTitle}</span>
        <strong>{`${Math.round(mastery)} ${units.cpm}`}</strong>
        <p>{labels.profileIntro}</p>
      </div>

      <GamificationPanel labels={labels} gamification={gamification} />
    </div>
  );
}
