interface Props {
  labels: {
    mastery: string;
    speed: string;
    accuracy: string;
    cadence: string;
    errors: string;
    progress: string;
  };
  units: {
    cpm: string;
    percent: string;
  };
  masteryCpm: number | null;
  masteryLevel: string;
  speedCpm: number;
  accuracy: number;
  cadence: number;
  errors: number;
  progress: number;
  variant?: "default" | "practice";
}

export type MasteryLevelId = "starter" | "beginner" | "confident" | "middle" | "strong" | "pro";

export function masteryLevelForCpm(cpm: number): MasteryLevelId {
  const cleanCpm = Number.isFinite(cpm) ? cpm : 0;
  if (cleanCpm >= 420) {
    return "pro";
  }
  if (cleanCpm >= 320) {
    return "strong";
  }
  if (cleanCpm >= 240) {
    return "middle";
  }
  if (cleanCpm >= 160) {
    return "confident";
  }
  if (cleanCpm >= 80) {
    return "beginner";
  }
  return "starter";
}

function Stat({ label, value, accent, animated }: { label: string; value: string; accent?: boolean; animated?: boolean }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong
        key={animated ? value : undefined}
        className={`${accent ? "stat__value--accent" : ""} ${animated ? "stat__value--animated" : ""}`.trim() || undefined}
      >
        {value}
      </strong>
    </div>
  );
}

export function StatsPanel({ labels, units, masteryCpm, masteryLevel, speedCpm, accuracy, cadence, errors, progress, variant = "default" }: Props) {
  const masteryValue = masteryCpm == null ? `— ${units.cpm}` : `${Math.round(masteryCpm)} ${units.cpm}`;
  const animated = variant === "practice";

  return (
    <div className={`stats-panel stats-panel--${variant}`}>
      <div className="stats-panel__grid">
        <Stat label={labels.mastery} value={`${masteryValue} · ${masteryLevel}`} accent animated={animated} />
        <Stat label={labels.speed} value={`${Math.round(speedCpm)} ${units.cpm}`} animated={animated} />
        <Stat label={labels.accuracy} value={`${Math.round(accuracy * 100)}${units.percent}`} animated={animated} />
        <Stat label={labels.cadence} value={`${Math.round(cadence * 100)}${units.percent}`} animated={animated} />
        <Stat label={labels.errors} value={String(errors)} accent={errors > 0} animated={animated} />
        <Stat label={labels.progress} value={`${Math.round(progress * 100)}${units.percent}`} animated={animated} />
      </div>
      <div className="stats-panel__bar" aria-hidden="true">
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
    </div>
  );
}
