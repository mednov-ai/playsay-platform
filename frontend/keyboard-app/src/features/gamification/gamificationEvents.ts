import type { GamificationEvent } from "../../shared/types";

export interface GamificationEventLabels {
  masteryUp: string;
  calibrationComplete: string;
  leagueProgressEvent: string;
  achievementUnlocked: string;
  prizeHook: string;
}

export function eventLabel(event: GamificationEvent, labels: GamificationEventLabels): string {
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
    return format(labels.achievementUnlocked, { code: event.payload.code ?? event.type, title: event.payload.code ?? event.type });
  }
  return labels.prizeHook;
}

export function format(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.split(`{{${key}}}`).join(String(value)),
    template,
  );
}
