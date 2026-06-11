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
}

export type MasteryLevelId = "starter" | "beginner" | "confident" | "middle" | "strong" | "pro";

export function masteryLevelForCpm(cpm: number): MasteryLevelId {
  const cleanCpm = Number.isFinite(cpm) ? cpm : 0;
  if (cleanCpm >= 450) {
    return "pro";
  }
  if (cleanCpm >= 350) {
    return "strong";
  }
  if (cleanCpm >= 250) {
    return "middle";
  }
  if (cleanCpm >= 180) {
    return "confident";
  }
  if (cleanCpm >= 100) {
    return "beginner";
  }
  return "starter";
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong className={accent ? "stat__value--accent" : undefined}>{value}</strong>
    </div>
  );
}

export function StatsPanel({ labels, units, masteryCpm, masteryLevel, speedCpm, accuracy, cadence, errors, progress }: Props) {
  const masteryValue = masteryCpm == null ? `— ${units.cpm}` : `${Math.round(masteryCpm)} ${units.cpm}`;

  return (
    <div className="stats-panel">
      <div className="stats-panel__grid">
        <Stat label={labels.mastery} value={`${masteryValue} · ${masteryLevel}`} accent />
        <Stat label={labels.speed} value={`${Math.round(speedCpm)} ${units.cpm}`} />
        <Stat label={labels.accuracy} value={`${Math.round(accuracy * 100)}${units.percent}`} />
        <Stat label={labels.cadence} value={`${Math.round(cadence * 100)}${units.percent}`} />
        <Stat label={labels.errors} value={String(errors)} accent={errors > 0} />
        <Stat label={labels.progress} value={`${Math.round(progress * 100)}${units.percent}`} />
      </div>
      <div className="stats-panel__bar" aria-hidden="true">
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
    </div>
  );
}
