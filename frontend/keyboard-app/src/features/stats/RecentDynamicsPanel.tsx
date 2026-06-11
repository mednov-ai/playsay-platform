import type { CSSProperties } from "react";
import type { TrainingResult } from "../../shared/types";

interface Props {
  labels: {
    title: string;
    empty: string;
    mastery: string;
    speed: string;
    averageTempo: string;
    accuracy: string;
    errors: string;
    standard: string;
    focus: string;
    deltaUp: string;
    deltaDown: string;
    deltaFlat: string;
  };
  units: {
    cpm: string;
    percent: string;
  };
  recent: TrainingResult[];
}

export function RecentDynamicsPanel({ labels, recent, units }: Props) {
  const lessons = recent.slice(0, 5);
  const maxMastery = Math.max(1, ...lessons.map((lesson) => lesson.masteryCpm ?? lesson.averageCpm));
  return (
    <div className="recent-dynamics" role="document">
      {lessons.length > 0 ? (
        <>
          <div className="recent-dynamics__chart" aria-label={labels.mastery}>
            {lessons.slice().reverse().map((lesson) => (
              <span
                key={`chart-${lesson.id}`}
                style={{ "--bar-height": `${Math.max(8, Math.round(((lesson.masteryCpm ?? lesson.averageCpm) / maxMastery) * 100))}%` } as CSSProperties}
              >
                <b>{Math.round(lesson.masteryCpm ?? lesson.averageCpm)}</b>
              </span>
            ))}
          </div>
          <ol>
            {lessons.map((lesson, index) => {
              const previous = lessons[index + 1];
              return (
              <li key={lesson.id}>
                <span className="recent-dynamics__kind">
                  {lesson.lessonKind === "FOCUS" ? labels.focus : labels.standard}
                </span>
                <span>
                  <small>{labels.mastery}</small>
                  <b>{`${Math.round(lesson.masteryCpm ?? lesson.averageCpm)} ${units.cpm}`}</b>
                  <small>
                    {previous
                      ? formatDelta(Math.round((lesson.masteryCpm ?? 0) - (previous.masteryCpm ?? 0)), labels)
                      : labels.deltaFlat}
                  </small>
                </span>
                <span>
                  <small>{labels.averageTempo}</small>
                  <b>{`${Math.round(lesson.averageCpm)} ${units.cpm}`}</b>
                  <small>{previous ? formatDelta(Math.round(lesson.averageCpm - previous.averageCpm), labels) : labels.deltaFlat}</small>
                </span>
                <span>
                  <small>{labels.accuracy}</small>
                  <b>{`${Math.round(lesson.accuracy * 100)}${units.percent}`}</b>
                  <small>
                    {previous
                      ? formatDelta(Math.round((lesson.accuracy - previous.accuracy) * 100), labels, units.percent)
                      : labels.deltaFlat}
                  </small>
                </span>
                <span>
                  <b>{lesson.errors}</b>
                  <small>{previous ? formatDelta(lesson.errors - previous.errors, labels) : labels.deltaFlat}</small>
                </span>
              </li>
              );
            })}
          </ol>
        </>
      ) : (
        <p>{labels.empty}</p>
      )}
    </div>
  );
}

function formatDelta(
  value: number,
  labels: Pick<Props["labels"], "deltaUp" | "deltaDown" | "deltaFlat">,
  suffix = "",
): string {
  if (value === 0) {
    return labels.deltaFlat;
  }
  const template = value > 0 ? labels.deltaUp : labels.deltaDown;
  return template.replace("{{value}}", `${Math.abs(value)}${suffix}`);
}
