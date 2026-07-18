import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarClock, Loader2, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  DURATION_PRESET_MINUTES,
  localScheduleValues,
  rescheduleInputFromLocalValues,
  scheduledLessonDurationMinutes,
} from "../../../entities/schedule/model";
import type { ScheduledLesson, ScheduledLessonScheduleInput } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

export function LessonRescheduleDialog({
  disabled,
  lesson,
  onClose,
  onSave,
}: {
  disabled: boolean;
  lesson: ScheduledLesson;
  onClose: () => void;
  onSave: (lessonId: string, input: ScheduledLessonScheduleInput) => Promise<ScheduledLesson | null>;
}) {
  const { t } = useAppTranslation();
  const initialStart = useMemo(() => localScheduleValues(lesson.scheduledStart), [lesson.scheduledStart]);
  const [date, setDate] = useState(initialStart.date);
  const [time, setTime] = useState(initialStart.time);
  const [duration, setDuration] = useState(String(scheduledLessonDurationMinutes(lesson)));
  const input = rescheduleInputFromLocalValues(date, time, duration);
  const participantNames = lesson.participants
    .map((participant) => participant.displayName ?? participant.username ?? participant.subject)
    .join(", ");

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !disabled) {
        onClose();
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [disabled, onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input) {
      return;
    }
    const updated = await onSave(lesson.id, input);
    if (updated) {
      onClose();
    }
  }

  return (
    <div className="playsay-schedule-wizard-backdrop" role="presentation">
      <form
        aria-labelledby="lesson-reschedule-title"
        aria-modal="true"
        className="playsay-reschedule-dialog"
        onSubmit={(event) => void submit(event)}
        role="dialog"
      >
        <header className="playsay-schedule-wizard-head">
          <div>
            <span>{t("schedule.reschedule.eyebrow")}</span>
            <h2 id="lesson-reschedule-title">{t("schedule.reschedule.title")}</h2>
            <p>{lesson.lessonTitle ?? lesson.courseTitle ?? t("schedule.lessonFallbackTitle")}</p>
          </div>
          <Button aria-label={t("schedule.reschedule.close")} disabled={disabled} onClick={onClose} type="button" variant="outline">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="playsay-reschedule-body">
          <CalendarClock className="playsay-schedule-wizard-icon" />
          <div className="playsay-reschedule-grid">
            <label>
              <span>{t("schedule.form.date")}</span>
              <input className="playsay-input" disabled={disabled} onChange={(event) => setDate(event.target.value)} required type="date" value={date} />
            </label>
            <label>
              <span>{t("schedule.form.time")}</span>
              <input className="playsay-input" disabled={disabled} onChange={(event) => setTime(event.target.value)} required type="time" value={time} />
            </label>
            <label>
              <span>{t("schedule.form.duration")}</span>
              <input className="playsay-input" disabled={disabled} max={180} min={10} onChange={(event) => setDuration(event.target.value)} required type="number" value={duration} />
            </label>
          </div>
          <div className="playsay-reschedule-presets">
            {DURATION_PRESET_MINUTES.map((minutes) => (
              <button data-selected={duration === String(minutes)} disabled={disabled} key={minutes} onClick={() => setDuration(String(minutes))} type="button">
                {t("schedule.duration.minutes", { count: minutes })}
              </button>
            ))}
          </div>
          <div className="playsay-reschedule-note">
            <strong>{t("schedule.reschedule.students")}</strong>
            <span>{participantNames || t("schedule.participants.none")}</span>
          </div>
          <p className="playsay-reschedule-email-note">{t("schedule.reschedule.emailNotice")}</p>
          {lesson.recurrenceSeriesId ? <p className="playsay-reschedule-series-note">{t("schedule.reschedule.seriesNotice")}</p> : null}
        </div>

        <footer className="playsay-schedule-wizard-footer">
          <Button disabled={disabled} onClick={onClose} type="button" variant="outline">{t("common.actions.cancel")}</Button>
          <Button disabled={disabled || !input} type="submit">
            {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
            {t("schedule.reschedule.save")}
          </Button>
        </footer>
      </form>
    </div>
  );
}
