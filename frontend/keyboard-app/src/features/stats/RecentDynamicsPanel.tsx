import type { TrainingResult } from "../../shared/types";

interface Props {
  labels: {
    title: string;
    empty: string;
    speed: string;
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
  return (
    <details className="recent-dynamics" open={lessons.length > 0}>
      <summary>{labels.title}</summary>
      {lessons.length > 0 ? (
        <ol>
          {lessons.map((lesson, index) => {
            const previous = lessons[index + 1];
            return (
              <li key={lesson.id}>
                <span className="recent-dynamics__kind">
                  {lesson.lessonKind === "FOCUS" ? labels.focus : labels.standard}
                </span>
                <span>
                  <b>{`${Math.round(lesson.speedCpm)} ${units.cpm}`}</b>
                  <small>{previous ? formatDelta(Math.round(lesson.speedCpm - previous.speedCpm), labels) : labels.deltaFlat}</small>
                </span>
                <span>
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
      ) : (
        <p>{labels.empty}</p>
      )}
    </details>
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
