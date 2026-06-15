import type { ReactNode } from "react";
import { Keyboard, TrendingUp } from "lucide-react";

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
    errors: string;
  };
  masteryCpm: number | null;
  masteryLevel: string;
  speedCpm: number;
  accuracy: number;
  cadence: number;
  errors: number;
  progress: number;
  variant?: "default" | "practice";
  currentLabel?: string;
  currentTitle?: string;
  currentHint?: string | null;
  actions?: ReactNode;
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

function MetricStat({
  label,
  number,
  suffix,
  ariaValue,
  accent,
  animated,
}: {
  label: string;
  number: string;
  suffix?: string;
  ariaValue: string;
  accent?: boolean;
  animated?: boolean;
}) {
  const valueKey = `${number}-${suffix ?? ""}`;
  const suffixClassName = suffix && suffix.length > 1 ? "stat__suffix stat__suffix--unit" : "stat__suffix";

  return (
    <div className="stat stat--metric">
      <span>{label}</span>
      <strong
        key={animated ? valueKey : undefined}
        aria-label={ariaValue}
        className={`${accent ? "stat__value--accent" : ""} ${animated ? "stat__value--animated" : ""}`.trim() || undefined}
      >
        <span className="stat__value-line" aria-hidden="true">
          <span className="stat__number">{number}</span>
          {suffix ? <span className={suffixClassName}>{suffix}</span> : null}
        </span>
      </strong>
    </div>
  );
}

export function StatsPanel({
  labels,
  units,
  masteryCpm,
  masteryLevel,
  speedCpm,
  accuracy,
  cadence,
  errors,
  progress,
  variant = "default",
  currentLabel,
  currentTitle,
  actions,
}: Props) {
  const masteryNumber = masteryCpm == null ? "—" : String(Math.round(masteryCpm));
  const masteryValue = `${masteryNumber} ${units.cpm}`;
  const masteryAriaValue = `${masteryValue} · ${masteryLevel}`;
  const speedValue = String(Math.round(speedCpm));
  const accuracyValue = String(Math.round(accuracy * 100));
  const cadenceValue = String(Math.round(cadence * 100));
  const errorsValue = String(errors);
  const progressValue = String(Math.round(progress * 100));
  const animated = variant === "practice";
  const hasMergedHeader = Boolean(currentTitle || actions);

  const masteryCard = (
    <div className="stats-panel__mastery-card">
      <span className="stats-panel__mastery-icon" aria-hidden="true">
        <TrendingUp size={24} strokeWidth={2.4} />
      </span>
      <div className="stats-panel__mastery-copy">
        <span>{labels.mastery}</span>
        <strong
          key={animated ? `${masteryValue}-${masteryLevel}` : undefined}
          aria-label={masteryAriaValue}
          className={`stat__value--accent ${animated ? "stat__value--animated" : ""}`.trim()}
        >
          <span className="stats-panel__mastery-value-line" aria-hidden="true">
            <span className="stat__number stats-panel__mastery-number">{masteryNumber}</span>
            <span className="stat__suffix stat__suffix--unit stats-panel__mastery-unit">{units.cpm}</span>
          </span>
          <span className="stats-panel__mastery-divider" aria-hidden="true">·</span>
          <span className="stats-panel__mastery-level" aria-hidden="true">{masteryLevel}</span>
        </strong>
      </div>
    </div>
  );

  return (
    <div className={`stats-panel stats-panel--${variant}`}>
      {hasMergedHeader ? (
        <div className="stats-panel__top">
          {masteryCard}
          <div className="stats-panel__set-card">
            <span className="stats-panel__set-icon" aria-hidden="true">
              <Keyboard size={24} strokeWidth={2.4} />
            </span>
            <div className="stats-panel__set-copy">
              {currentLabel ? <span>{currentLabel}</span> : null}
              {currentTitle ? <h1>{currentTitle}</h1> : null}
            </div>
          </div>
          {actions ? (
            <div className="stats-panel__actions-card">
              <div className="stats-panel__actions">{actions}</div>
            </div>
          ) : null}
        </div>
      ) : masteryCard}
      <div className="stats-panel__metrics">
        <MetricStat label={labels.speed} number={speedValue} suffix={units.cpm} ariaValue={`${speedValue} ${units.cpm}`} animated={animated} />
        <MetricStat label={labels.accuracy} number={accuracyValue} suffix={units.percent} ariaValue={`${accuracyValue}${units.percent}`} animated={animated} />
        <MetricStat label={labels.cadence} number={cadenceValue} suffix={units.percent} ariaValue={`${cadenceValue}${units.percent}`} animated={animated} />
        <MetricStat label={labels.errors} number={errorsValue} suffix={units.errors} ariaValue={`${errorsValue} ${units.errors}`} accent={errors > 0} animated={animated} />
        <MetricStat label={labels.progress} number={progressValue} suffix={units.percent} ariaValue={`${progressValue}${units.percent}`} animated={animated} />
      </div>
      <div className="stats-panel__progress" aria-hidden="true">
        <div className="stats-panel__bar">
          <span style={{ width: `${progressValue}%` }} />
        </div>
        <span className="stats-panel__bar-value">{`${progressValue}${units.percent}`}</span>
      </div>
    </div>
  );
}
