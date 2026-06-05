interface Props {
  labels: {
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
  speedCpm: number;
  accuracy: number;
  cadence: number;
  errors: number;
  progress: number;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong className={accent ? "stat__value--accent" : undefined}>{value}</strong>
    </div>
  );
}

export function StatsPanel({ labels, units, speedCpm, accuracy, cadence, errors, progress }: Props) {
  return (
    <div className="stats-panel">
      <div className="stats-panel__grid">
        <Stat label={labels.speed} value={`${Math.round(speedCpm)} ${units.cpm}`} accent />
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
