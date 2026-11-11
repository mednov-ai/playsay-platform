import { useTranslation } from "react-i18next";
import type { VocabularyTargetDeliveryStatus } from "../../features/typing/useVocabularyTargetDelivery";

export function VocabularyTargetDeliveryNotice({ status, onRetry }: { status: VocabularyTargetDeliveryStatus; onRetry: () => void }) {
  const { t } = useTranslation();
  const message = status === "unsaved" ? "trainer.vocabularyPendingUnsaved" : status === "offline" ? "trainer.vocabularyPendingOffline" : "trainer.vocabularyPendingTargets";
  return (
    <div className="vocabulary-target-delivery">
      <span role="status">{t(message)}</span>
      {status === "offline" || status === "unsaved" ? <button type="button" onClick={onRetry}>{t("trainer.vocabularyRetryTargetSave")}</button> : null}
    </div>
  );
}
