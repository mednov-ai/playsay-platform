import { Check, ExternalLink, Loader2, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/button";
import {
  fetchVocabularyPracticeSession,
  recordVocabularyAttempt,
  revealVocabularyPracticeItem,
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
  const [phrase, setPhrase] = useState<Array<{ id: string; label: string }>>([]);
  const [matchingPairs, setMatchingPairs] = useState<Array<{ leftId: string; leftLabel: string; rightId: string; rightLabel: string }>>([]);
  const [matchingSelection, setMatchingSelection] = useState<{ left?: { id: string; label: string }; right?: { id: string; label: string } }>({});
  const [revealed, setRevealed] = useState(false);
  const [revealedAnswer, setRevealedAnswer] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<VocabularyAttemptResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const item = session.currentItem;
  const matchingContent = item?.content && "left" in item.content && "right" in item.content ? item.content : null;
  const phraseContent = item?.content && "tokens" in item.content ? item.content : null;

  useEffect(() => {
    setSession(initialSession);
    setAnswer("");
    setPhrase([]);
    setMatchingPairs([]);
    setMatchingSelection({});
    setFeedback(null);
    setRevealed(false);
    setRevealedAnswer(null);
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
    setMatchingPairs([]);
    setMatchingSelection({});
    setRevealed(false);
    setRevealedAnswer(null);
  }

  async function revealFlashcard() {
    if (!item || readOnly || item.exerciseType !== "FLASHCARD") return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await revealVocabularyPracticeItem(session.id, item.id);
      setRevealedAnswer(result.expectedAnswer);
      setRevealed(true);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : t("vocabulary.practice.errors.save"));
    } finally {
      setSaving(false);
    }
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
                  {revealedAnswer}
                </div>
              ) : (
                <Button disabled={saving || readOnly} onClick={() => void revealFlashcard()} type="button" variant="outline">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
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
          ) : item.exerciseType === "MEANING_CHOICE" ? (
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {item.options.map((option) => (
                <Button className="min-h-12 whitespace-normal" disabled={saving || readOnly} key={option} onClick={() => void submit(undefined, option)} type="button" variant="outline">
                  {option}
                </Button>
              ))}
            </div>
          ) : item.exerciseType === "MATCHING" && matchingContent ? (
            <div className="mt-6 grid gap-4">
              <div className="grid grid-cols-2 gap-3" role="group" aria-label={t("vocabulary.practice.matching.label")}>
                <div className="grid content-start gap-2">
                  {matchingContent.left.map((option) => {
                    const used = matchingPairs.some((pair) => pair.leftId === option.id);
                    const selected = matchingSelection.left?.id === option.id;
                    return (
                      <Button
                        aria-pressed={selected}
                        className="min-h-12 whitespace-normal"
                        disabled={readOnly || used}
                        key={option.id}
                        onClick={() => setMatchingSelection((current) => ({ ...current, left: option }))}
                        type="button"
                        variant={selected ? "default" : "outline"}
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
                <div className="grid content-start gap-2">
                  {matchingContent.right.map((option) => {
                    const used = matchingPairs.some((pair) => pair.rightId === option.id);
                    const selected = matchingSelection.right?.id === option.id;
                    return (
                      <Button
                        aria-pressed={selected}
                        className="min-h-12 whitespace-normal"
                        disabled={readOnly || used}
                        key={option.id}
                        onClick={() => setMatchingSelection((current) => ({ ...current, right: option }))}
                        type="button"
                        variant={selected ? "default" : "outline"}
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <Button
                disabled={readOnly || !matchingSelection.left || !matchingSelection.right}
                onClick={() => {
                  const left = matchingSelection.left;
                  const right = matchingSelection.right;
                  if (!left || !right) return;
                  setMatchingPairs((current) => [...current, {
                    leftId: left.id,
                    leftLabel: left.label,
                    rightId: right.id,
                    rightLabel: right.label,
                  }]);
                  setMatchingSelection({});
                }}
                type="button"
                variant="outline"
              >
                {t("vocabulary.practice.matching.connect")}
              </Button>
              {matchingPairs.length ? (
                <div className="grid gap-2">
                  {matchingPairs.map((pair) => (
                    <button
                      aria-label={t("vocabulary.practice.matching.remove", { left: pair.leftLabel, right: pair.rightLabel })}
                      className="flex items-center justify-between gap-2 rounded-xl bg-muted p-3 text-left text-sm font-bold"
                      key={pair.leftId}
                      onClick={() => setMatchingPairs((current) => current.filter((itemPair) => itemPair.leftId !== pair.leftId))}
                      type="button"
                    >
                      <span>{pair.leftLabel} ↔ {pair.rightLabel}</span><X className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              ) : null}
              <Button
                disabled={saving || readOnly || matchingPairs.length !== matchingContent.left.length}
                onClick={() => void submit(undefined, matchingPairs
                  .slice()
                  .sort((first, second) => first.leftId.localeCompare(second.leftId))
                  .map((pair) => `${pair.leftId}:${pair.rightId}`)
                  .join("|"))}
                type="button"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t("vocabulary.practice.actions.check")}
              </Button>
            </div>
          ) : item.exerciseType === "PHRASE_BUILDER" ? (
            <div className="mt-6 grid gap-4">
              <div className="min-h-14 rounded-2xl border border-border bg-muted/50 p-3 text-center font-extrabold">
                {phrase.length ? (
                  <span className="flex flex-wrap justify-center gap-2">
                    {phrase.map((part) => (
                      <button
                        aria-label={t("vocabulary.practice.phrase.remove", { word: part.label })}
                        className="rounded-lg bg-white px-2 py-1 shadow-sm"
                        key={part.id}
                        onClick={() => setPhrase((current) => current.filter((itemPart) => itemPart.id !== part.id))}
                        type="button"
                      >
                        {part.label} <X className="inline h-3.5 w-3.5" />
                      </button>
                    ))}
                  </span>
                ) : t("vocabulary.practice.phrase.placeholder")}
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {(phraseContent?.tokens ?? item.options.map((label, index) => ({ id: `legacy-${index}`, label }))).map((part) => (
                  <Button
                    disabled={readOnly || phrase.some((selected) => selected.id === part.id)}
                    key={part.id}
                    onClick={() => setPhrase((current) => [...current, part])}
                    type="button"
                    variant="outline"
                  >
                    {part.label}
                  </Button>
                ))}
                <Button aria-label={t("vocabulary.practice.phrase.reset")} disabled={readOnly || phrase.length === 0} onClick={() => setPhrase([])} type="button" variant="outline"><RotateCcw className="h-4 w-4" /></Button>
              </div>
              <Button disabled={saving || readOnly || phrase.length === 0} onClick={() => void submit(undefined, phrase.map((part) => part.label).join(" "))} type="button">
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
  return `${keyboardOrigin()}/?${params.toString()}`;
}

function keyboardOrigin(): string {
  const configured = import.meta.env.VITE_KEYBOARD_ORIGIN?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const current = new URL(window.location.origin);
  const localDevelopment = current.hostname === "localhost" || current.hostname === "127.0.0.1";
  if (current.hostname.startsWith("dev.online.")) current.hostname = current.hostname.replace(/^dev\.online\./, "dev.key.");
  else if (current.hostname.startsWith("online.")) current.hostname = current.hostname.replace(/^online\./, "key.");
  current.port = localDevelopment ? "5175" : "";
  current.pathname = "";
  return current.origin;
}
