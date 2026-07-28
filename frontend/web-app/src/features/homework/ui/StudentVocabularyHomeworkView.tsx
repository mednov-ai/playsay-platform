import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/button";
import {
  fetchVocabularyPracticeSession,
  type StudentVocabularyHomeworkDetail,
  type VocabularyPracticeSession,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { VocabularyPracticePlayer } from "../../vocabulary/ui/VocabularyPracticePlayer";

export function StudentVocabularyHomeworkView({
  detail,
  onBack,
}: {
  detail: StudentVocabularyHomeworkDetail;
  onBack: () => void;
}) {
  const { t } = useAppTranslation();
  const [session, setSession] = useState<VocabularyPracticeSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSession(null);
    setError(null);
    fetchVocabularyPracticeSession(detail.sessionId)
      .then((value) => { if (!cancelled) setSession(value); })
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : t("homework.messages.detailLoadFailed")); });
    return () => { cancelled = true; };
  }, [detail.sessionId]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Button onClick={onBack} type="button" variant="outline"><ArrowLeft className="h-4 w-4" />{t("homework.actions.backToList")}</Button>
        <span className="rounded-full bg-[#fff3eb] px-3 py-1 text-xs font-black text-primary">{t("homework.contentKind.words")}</span>
      </div>
      {error ? <p className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4 font-semibold text-destructive">{error}</p> : session ? (
        <VocabularyPracticePlayer initialSession={session} onSessionChange={setSession} />
      ) : (
        <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      )}
    </div>
  );
}
