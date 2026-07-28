import { Check, ExternalLink, Loader2, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/button";
import {
  fetchVocabularyPracticeSession,
  recordVocabularyAttempt,
  type VocabularyAttemptResult,
  type VocabularyPracticeRating,
  type VocabularyPracticeSession,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

export function VocabularyPracticePlayer({
  initialSession,
  onSessionChange,
  readOnly = false,
}: {
  initialSession: VocabularyPracticeSession;
  onSessionChange?: (session: VocabularyPracticeSession) => void;
  readOnly?: boolean;
}) {
  const { t } = useAppTranslation();
  const [session, setSession] = useState(initialSession);
  const [answer, setAnswer] = useState("");
  const [phrase, setPhrase] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [feedback, setFeedback] = useState<VocabularyAttemptResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const item = session.currentItem;

  useEffect(() => {
    setSession(initialSession);
    setAnswer("");
    setPhrase([]);
    setFeedback(null);
    setRevealed(false);
  }, [initialSession.id, initialSession.revision]);

  useEffect(() => {
    if (item?.exerciseType !== "KEYBOARD" || readOnly) return undefined;
    let cancelled = false;
    async function refreshAfterKey() {
      if (document.visibilityState === "hidden") return;
      const refreshed = await fetchVocabularyPracticeSession(session.id).catch(() => null);
      if (cancelled || !refreshed || refreshed.revision === session.revision) return;
      setSession(refreshed);
      onSessionChange?.(refreshed);
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") void refreshAfterKey();
    }
    window.addEventListener("focus", refreshAfterKey);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const timer = window.setInterval(() => void refreshAfterKey(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshAfterKey);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [item?.id, item?.exerciseType, onSessionChange, readOnly, session.id, session.revision]);

  const progress = useMemo(
    () => session.totalItems > 0 ? Math.round((session.completedItems / session.totalItems) * 100) : 100,
    [session.completedItems, session.totalItems],
  );

  async function submit(rating?: VocabularyPracticeRating, value = answer) {
    if (!item || readOnly) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await recordVocabularyAttempt(session.id, {
        answer: value,
        clientAttemptId: crypto.randomUUID(),
        hintsUsed: session.teacherHint ? 1 : 0,
        itemId: item.id,
        rating,
        sessionRevision: session.revision,
      });
      setFeedback(result);
      setSession(result.session);
      onSessionChange?.(result.session);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : t("vocabulary.practice.errors.save"));
      try {
        const refreshed = await fetchVocabularyPracticeSession(session.id);
        setSession(refreshed);
        onSessionChange?.(refreshed);
      } catch {
        // Keep the current item so the learner can retry explicitly.
      }
    } finally {
      setSaving(false);
    }
  }

  function continuePractice() {
    setFeedback(null);
    setAnswer("");
    setPhrase([]);
    setRevealed(false);
  }

  if (session.status === "COMPLETED" || (!item && session.totalItems === session.completedItems)) {
    return (
      <section className="mx-auto grid max-w-xl place-items-center gap-4 rounded-3xl border border-border bg-white p-8 text-center shadow-sm">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-[#effaf3] text-[#197a45]"><Check className="h-7 w-7" /></span>
        <div>
          <h2 className="text-2xl font-black">{t("vocabulary.practice.complete.title")}</h2>
          <p className="mt-2 font-semibold text-muted-foreground">
            {t("vocabulary.practice.complete.result", {
              correct: session.correctCount,
              total: session.attemptCount,
            })}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-2xl rounded-3xl border border-border bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3 text-sm font-extrabold text-muted-foreground">
        <span>{t("vocabulary.practice.progress", { current: session.completedItems + 1, total: session.totalItems })}</span>
        <span>{progress}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
      </div>

      {feedback ? (
        <div className="mt-6 grid gap-4 text-center">
          <span className={`mx-auto grid h-12 w-12 place-items-center rounded-full ${feedback.correct ? "bg-[#effaf3] text-[#197a45]" : "bg-[#fff0ed] text-[#b72d20]"}`}>
            {feedback.correct ? <Check className="h-6 w-6" /> : <X className="h-6 w-6" />}
          </span>
          <div>
            <h2 className="text-xl font-black">
              {feedback.correct ? t("vocabulary.practice.feedback.correct") : t("vocabulary.practice.feedback.again")}
            </h2>
            <p className="mt-2 text-sm font-bold text-muted-foreground">
              {t("vocabulary.practice.feedback.answer")} <span className="text-foreground">{feedback.expectedAnswer}</span>
            </p>
          </div>
          <Button onClick={continuePractice} type="button">{t("vocabulary.practice.actions.continue")}</Button>
        </div>
      ) : item ? (
        <div className="mt-6">
          <p className="text-center text-xs font-black uppercase tracking-[0.16em] text-primary">
            {t(`vocabulary.practice.exercise.${item.exerciseType}`)}
          </p>
          <h2 className="mx-auto mt-3 max-w-xl text-center text-2xl font-black leading-snug sm:text-3xl">{item.prompt}</h2>
          {session.teacherHint ? (
            <p className="mx-auto mt-4 max-w-md rounded-2xl border border-primary/20 bg-[#fff7f0] p-3 text-center font-black text-primary">
              {t("vocabulary.practice.teacherHint", { hint: session.teacherHint })}
            </p>
          ) : null}

          {item.exerciseType === "FLASHCARD" ? (
            <div className="mt-6 grid gap-4">
              {revealed ? (
                <div className="rounded-2xl border border-primary/25 bg-[#fff8f3] p-5 text-center text-xl font-extrabold text-primary">
                  {item.translation ?? item.sourceText}
                </div>
              ) : (
                <Button disabled={readOnly} onClick={() => setRevealed(true)} type="button" variant="outline">
                  {t("vocabulary.practice.actions.reveal")}
                </Button>
              )}
              {revealed ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Button disabled={saving || readOnly} onClick={() => void submit("AGAIN")} type="button" variant="outline">{t("vocabulary.practice.rating.AGAIN")}</Button>
                  <Button disabled={saving || readOnly} onClick={() => void submit("HARD")} type="button" variant="outline">{t("vocabulary.practice.rating.HARD")}</Button>
                  <Button disabled={saving || readOnly} onClick={() => void submit("GOOD")} type="button">{t("vocabulary.practice.rating.GOOD")}</Button>
                </div>
              ) : null}
            </div>
          ) : item.exerciseType === "MEANING_CHOICE" || item.exerciseType === "MATCHING" ? (
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {item.options.map((option) => (
                <Button className="min-h-12 whitespace-normal" disabled={saving || readOnly} key={option} onClick={() => void submit(undefined, option)} type="button" variant="outline">
                  {option}
                </Button>
              ))}
            </div>
          ) : item.exerciseType === "PHRASE_BUILDER" ? (
            <div className="mt-6 grid gap-4">
              <div className="min-h-14 rounded-2xl border border-border bg-muted/50 p-3 text-center font-extrabold">
                {phrase.length ? phrase.join(" ") : t("vocabulary.practice.phrase.placeholder")}
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {item.options.map((part, index) => (
                  <Button disabled={readOnly} key={`${part}-${index}`} onClick={() => setPhrase((current) => [...current, part])} type="button" variant="outline">{part}</Button>
                ))}
                <Button aria-label={t("vocabulary.practice.phrase.reset")} disabled={readOnly || phrase.length === 0} onClick={() => setPhrase([])} type="button" variant="outline"><RotateCcw className="h-4 w-4" /></Button>
              </div>
              <Button disabled={saving || readOnly || phrase.length === 0} onClick={() => void submit(undefined, phrase.join(" "))} type="button">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t("vocabulary.practice.actions.check")}
              </Button>
            </div>
          ) : item.exerciseType === "KEYBOARD" ? (
            <div className="mt-6 grid gap-3">
              <Button asChild>
                <a href={keyPracticeUrl(session.id)} rel="noopener noreferrer" target="_blank">
                  <ExternalLink className="h-4 w-4" />{t("vocabulary.practice.actions.openKey")}
                </a>
              </Button>
              <p className="text-center text-sm font-semibold text-muted-foreground">{t("vocabulary.practice.keyHint")}</p>
            </div>
          ) : (
            <form className="mt-6 grid gap-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
              <label className="sr-only" htmlFor={`vocabulary-answer-${item.id}`}>{t("vocabulary.practice.answerLabel")}</label>
              <input
                autoComplete="off"
                autoFocus
                className="playsay-input min-h-12 text-center text-lg font-bold"
                disabled={readOnly}
                id={`vocabulary-answer-${item.id}`}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder={t("vocabulary.practice.answerPlaceholder")}
                value={answer}
              />
              <Button disabled={saving || readOnly || !answer.trim()} type="submit">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t("vocabulary.practice.actions.check")}
              </Button>
            </form>
          )}
        </div>
      ) : (
        <div className="mt-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      )}
      {message ? <p aria-live="assertive" className="mt-4 text-center text-sm font-bold text-destructive">{message}</p> : null}
    </section>
  );
}

function keyPracticeUrl(sessionId: string): string {
  const returnTo = window.location.href;
  const params = new URLSearchParams({ vocabularySessionId: sessionId, returnTo });
  return `https://key.honey.school/?${params.toString()}`;
}
