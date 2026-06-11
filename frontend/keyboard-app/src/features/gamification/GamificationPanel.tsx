import type { GamificationEvent, GamificationProfile } from "../../shared/types";

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
  events: string;
  noEvents: string;
  masteryUp: string;
  calibrationComplete: string;
  leagueProgressEvent: string;
  achievementUnlocked: string;
  prizeHook: string;
}

interface Props {
  labels: GamificationPanelLabels;
  gamification?: GamificationProfile | null;
  events?: GamificationEvent[];
  compact?: boolean;
}

export function GamificationPanel({ labels, gamification, events = [], compact = false }: Props) {
  const calibrationDone = Math.min(
    gamification?.calibrationSessions ?? 0,
    gamification?.calibrationTarget ?? 3,
  );
  const calibrationTotal = gamification?.calibrationTarget ?? 3;
  const leagueLevel = gamification?.leagueLevel ?? 0;
  const achievements = gamification?.achievements ?? [];
  const shownEvents = events.slice(0, compact ? 2 : 4);

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

      <div className="gamification-panel__chips" aria-label={labels.achievements}>
        {achievements.length > 0 ? achievements.slice(0, 4).map((code) => <b key={code}>{code}</b>) : <small>{labels.noAchievements}</small>}
      </div>

      <div className="gamification-panel__events" aria-label={labels.events}>
        {shownEvents.length > 0 ? (
          shownEvents.map((event) => <span key={event.id}>{eventLabel(event, labels)}</span>)
        ) : (
          <small>{labels.noEvents}</small>
        )}
      </div>
    </section>
  );
}

function eventLabel(event: GamificationEvent, labels: GamificationPanelLabels): string {
  if (event.type === "MASTERY_UP") {
    return format(labels.masteryUp, { delta: event.payload.delta ?? "0" });
  }
  if (event.type === "CALIBRATION_COMPLETE") {
    return labels.calibrationComplete;
  }
  if (event.type === "LEAGUE_PROGRESS") {
    return format(labels.leagueProgressEvent, { level: event.payload.leagueLevel ?? "0" });
  }
  if (event.type === "ACHIEVEMENT_UNLOCKED") {
    return format(labels.achievementUnlocked, { code: event.payload.code ?? event.type });
  }
  return labels.prizeHook;
}

function format(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.split(`{{${key}}}`).join(String(value)),
    template,
  );
}
