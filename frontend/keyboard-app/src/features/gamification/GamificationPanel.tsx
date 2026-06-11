import type { GamificationProfile } from "../../shared/types";
import { format } from "./gamificationEvents";

export interface GamificationPanelLabels {
  title: string;
  calibration: string;
  calibrationProgress: string;
  calibrated: string;
  league: string;
  leagueFallback: string;
  leagueProgress: string;
  streak: string;
  bestStreak: string;
  freezes: string;
  achievements: string;
  noAchievements: string;
}

interface Props {
  labels: GamificationPanelLabels;
  gamification?: GamificationProfile | null;
  compact?: boolean;
}

export function GamificationPanel({ labels, gamification, compact = false }: Props) {
  const calibrationDone = Math.min(
    gamification?.calibrationSessions ?? 0,
    gamification?.calibrationTarget ?? 3,
  );
  const calibrationTotal = gamification?.calibrationTarget ?? 3;
  const leagueLevel = gamification?.leagueLevel ?? 0;
  const achievements = gamification?.achievements ?? [];

  return (
    <section className={`gamification-panel ${compact ? "gamification-panel--compact" : ""}`} aria-label={labels.title}>
      <header>
        <span>{labels.title}</span>
        <strong>{gamification?.calibrated ? labels.calibrated : labels.calibration}</strong>
      </header>

      <div className="gamification-panel__grid">
        <span>
          <small>{labels.calibration}</small>
          <b>{gamification?.calibrated ? labels.calibrated : format(labels.calibrationProgress, { done: calibrationDone, total: calibrationTotal })}</b>
        </span>
        <span>
          <small>{labels.league}</small>
          <b>{format(labels.leagueFallback, { level: leagueLevel })}</b>
          <small>{format(labels.leagueProgress, { value: gamification?.leagueProgress ?? 0 })}</small>
        </span>
        <span>
          <small>{labels.streak}</small>
          <b>{gamification?.currentStreak ?? 0}</b>
          <small>{format(labels.bestStreak, { value: gamification?.bestStreak ?? 0 })}</small>
        </span>
        <span>
          <small>{labels.freezes}</small>
          <b>{gamification?.streakFreezes ?? 0}</b>
        </span>
      </div>

      <span className="gamification-panel__chips-title">{labels.achievements}</span>
      <div className="gamification-panel__chips" aria-label={labels.achievements}>
        {achievements.length > 0 ? achievements.slice(0, 4).map((code) => <b key={code}>{code}</b>) : <small>{labels.noAchievements}</small>}
      </div>
    </section>
  );
}
