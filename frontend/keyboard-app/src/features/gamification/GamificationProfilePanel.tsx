import type { CSSProperties } from "react";
import { GamificationPanel, type GamificationPanelLabels } from "./GamificationPanel";
import type { GamificationProfile } from "../../shared/types";

export interface GamificationProfileLabels extends GamificationPanelLabels {
  profileTitle: string;
  profileIntro: string;
  masteryTrend: string;
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
  const trend = gamification?.trend ?? [];
  const maxTrend = Math.max(1, ...trend);
  const mastery = gamification?.masteryCpm ?? 0;

  return (
    <div className="gamification-profile" role="document">
      <div className="gamification-profile__hero">
        <span>{labels.profileTitle}</span>
        <strong>{`${Math.round(mastery)} ${units.cpm}`}</strong>
        <p>{labels.profileIntro}</p>
      </div>

      <GamificationPanel labels={labels} gamification={gamification} />

      <section className="gamification-profile__trend" aria-label={labels.masteryTrend}>
        <div>
          <span>{labels.currentMastery}</span>
          <strong>{`${Math.round(mastery)} ${units.cpm}`}</strong>
        </div>
        {trend.length > 0 ? (
          <div className="gamification-profile__bars" aria-label={labels.masteryTrend}>
            {trend.map((value, index) => (
              <span
                key={`${value}-${index}`}
                style={{ "--bar-height": `${Math.max(8, Math.round((value / maxTrend) * 100))}%` } as CSSProperties}
              >
                <b>{Math.round(value)}</b>
              </span>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
