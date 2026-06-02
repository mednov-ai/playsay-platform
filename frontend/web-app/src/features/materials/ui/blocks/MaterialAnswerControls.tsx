import { type CSSProperties } from "react";
import { FileText } from "lucide-react";
import {
  MAX_MANUAL_INPUT_HINTS,
  MIN_MANUAL_INPUT_HINTS,
  materialAttemptBarRedPercent,
  materialAttemptBarVisible,
  type MaterialAnswerStatus,
} from "../../model/materialDocument";
import { useAppTranslation } from "../../../../shared/i18n";

export function MaterialAnswerTools({
  canRequestHint,
  hintLimit = MAX_MANUAL_INPUT_HINTS,
  onHint,
  status,
}: {
  canRequestHint: boolean;
  hintLimit?: number;
  onHint: () => void;
  status: MaterialAnswerStatus;
}) {
  const { t } = useAppTranslation();
  const nextHintNumber = Math.min(status.hintsUsed + 1, hintLimit);
  if (!canRequestHint) {
    return null;
  }

  return (
    <span className="playsay-answer-tools">
      <button
        aria-label={t("materials.renderer.hintProgress", { current: nextHintNumber, total: hintLimit })}
        className="playsay-hint-button"
        onClick={onHint}
        title={t("materials.renderer.hintProgress", { current: nextHintNumber, total: hintLimit })}
        type="button"
      >
        <FileText className="h-3.5 w-3.5" />
        {nextHintNumber}/{hintLimit}
      </button>
    </span>
  );
}

export function MaterialAttemptBar({ hintLimit = MIN_MANUAL_INPUT_HINTS, status }: { hintLimit?: number; status: MaterialAnswerStatus }) {
  const { t } = useAppTranslation();

  if (!materialAttemptBarVisible(status)) {
    return null;
  }

  const redPercent = materialAttemptBarRedPercent(status, hintLimit);
  const maxAttempts = Math.max(1, status.maxAttempts);
  const label = status.locked
    ? t("materials.renderer.attemptsFinished", { used: status.incorrectAttempts, total: maxAttempts })
    : status.hintsUsed > 0 && status.incorrectAttempts === 0 && !status.correct
      ? t("materials.renderer.hintsUsed", { used: status.hintsUsed, total: hintLimit })
      : status.correct
        ? t("materials.renderer.acceptedAttempts", { used: status.incorrectAttempts, total: maxAttempts })
        : t("materials.renderer.errorAttempts", { used: status.incorrectAttempts, total: maxAttempts });
  const style = {
    "--playsay-answer-red": `${redPercent}%`,
  } as CSSProperties;

  return (
    <span
      aria-label={label}
      className="playsay-answer-attempt-bar"
      data-kind={status.kind}
      role="img"
      style={style}
      title={label}
    />
  );
}
