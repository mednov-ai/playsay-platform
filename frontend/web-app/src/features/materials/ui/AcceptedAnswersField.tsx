import { type KeyboardEvent, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { materialAcceptedAnswersWithCandidate } from "../model/materialDocument";
import { useAppTranslation } from "../../../shared/i18n";

export function AcceptedAnswersField({
  acceptedAnswers,
  disabled,
  onChange,
  primaryAnswer,
}: {
  acceptedAnswers: string[];
  disabled: boolean;
  onChange: (acceptedAnswers: string[]) => void;
  primaryAnswer: string | undefined;
}) {
  const { t } = useAppTranslation();
  const [draft, setDraft] = useState("");

  function commitDraft() {
    const nextAcceptedAnswers = materialAcceptedAnswersWithCandidate(acceptedAnswers, primaryAnswer, draft);
    if (nextAcceptedAnswers.length !== acceptedAnswers.length) {
      onChange(nextAcceptedAnswers);
    }
    setDraft("");
  }

  function removeAcceptedAnswer(answer: string) {
    onChange(acceptedAnswers.filter((candidate) => candidate !== answer));
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    commitDraft();
  }

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-white px-2 py-1">
      {acceptedAnswers.map((answer) => (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#fff3eb] px-2 py-0.5 text-xs font-bold text-primary" key={answer}>
          {answer}
          <button
            aria-label={t("materials.blockEditor.removeAcceptedAnswer", { value: answer })}
            className="text-primary/75"
            disabled={disabled}
            onClick={() => removeAcceptedAnswer(answer)}
            title={t("materials.blockEditor.removeAcceptedAnswer", { value: answer })}
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
      <div className="flex min-w-[10rem] flex-1 items-center gap-1.5">
        <input
          className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none"
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleDraftKeyDown}
          placeholder={t("materials.blockEditor.acceptedAnswerDraftPlaceholder")}
          value={draft}
        />
        <Button
          aria-label={t("materials.blockEditor.addAcceptedAnswer")}
          className="h-7 shrink-0 px-2"
          disabled={disabled || !draft.trim()}
          onClick={commitDraft}
          title={t("materials.blockEditor.addAcceptedAnswer")}
          type="button"
          variant="outline"
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
