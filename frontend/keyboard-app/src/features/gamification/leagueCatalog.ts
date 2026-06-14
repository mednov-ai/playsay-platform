export type LeagueTierKey = "calibration" | "spark" | "rhythm" | "flow" | "sprint" | "master";

export interface LeagueCatalogLabels {
  leagueName_calibration: string;
  leagueDescription_calibration: string;
  leagueName_spark: string;
  leagueDescription_spark: string;
  leagueName_rhythm: string;
  leagueDescription_rhythm: string;
  leagueName_flow: string;
  leagueDescription_flow: string;
  leagueName_sprint: string;
  leagueDescription_sprint: string;
  leagueName_master: string;
  leagueDescription_master: string;
}

export interface LeagueTier {
  key: LeagueTierKey;
  level?: number;
  name: string;
  description: string;
}

export function leagueTierKeyForLevel(level?: number | null): LeagueTierKey {
  if (level == null || level <= 0) {
    return "calibration";
  }
  if (level === 1) {
    return "spark";
  }
  if (level === 2) {
    return "rhythm";
  }
  if (level === 3) {
    return "flow";
  }
  if (level === 4) {
    return "sprint";
  }
  return "master";
}

export function leagueLabelsForLevel(level: number | null | undefined, labels: LeagueCatalogLabels): LeagueTier {
  const key = leagueTierKeyForLevel(level);
  return {
    key,
    level: level == null ? undefined : level,
    name: labels[`leagueName_${key}`],
    description: labels[`leagueDescription_${key}`],
  };
}
