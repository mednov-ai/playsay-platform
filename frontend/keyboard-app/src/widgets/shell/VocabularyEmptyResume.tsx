import { useTranslation } from "react-i18next";
import type { VocabularyTargetDeliveryStatus } from "../../features/typing/useVocabularyTargetDelivery";
import { VocabularyTargetDeliveryNotice } from "./VocabularyTargetDeliveryNotice";

export function VocabularyEmptyResume({ href, target, deliveryStatus, onRetry, allTargetsRecorded }: {
  href: string;
  target?: "HONEY_SCHOOL_VOCABULARY" | "HONEY_SCHOOL_LESSON" | "HONEY_SCHOOL_HOMEWORK";
  deliveryStatus?: VocabularyTargetDeliveryStatus;
  allTargetsRecorded?: boolean;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="vocabulary-empty-resume">
      {deliveryStatus && onRetry ? <VocabularyTargetDeliveryNotice status={deliveryStatus} onRetry={onRetry} /> : <span role="status">{t(allTargetsRecorded ? "trainer.vocabularyTargetsRecorded" : "trainer.vocabularyEmptyResume")}</span>}
      <a href={href}>{t(`trainer.vocabularyReturn_${target ?? "HONEY_SCHOOL_VOCABULARY"}`)}</a>
    </div>
  );
}
