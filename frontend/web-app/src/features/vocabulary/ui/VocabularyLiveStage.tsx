import { ArrowLeft, Check, CircleHelp, Home, Loader2, Pause, Play, Square, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "../../../components/ui/button";
import {
  createVocabularyHomeworkAssignment,
  giveVocabularyPracticeHint,
  requestVocabularyPracticeHelp,
  updateVocabularyPracticeStatus,
  type VocabularyPractice,
  type VocabularyPracticeSession,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { VocabularyPracticePlayer } from "./VocabularyPracticePlayer";

export function VocabularyLiveStage({
  activeStudentSubject,
  canManage,
  onClose,
  onPracticeChange,
  practice,
  profileSubject,
  selectedStudentSubject,
  teacherPlayerOnly = false,
}: {
  activeStudentSubject?: string | null;
  canManage: boolean;
  onClose: () => void;
  onPracticeChange: (practice: VocabularyPractice) => void;
  practice: VocabularyPractice;
  profileSubject?: string;
  selectedStudentSubject?: string | null;
  teacherPlayerOnly?: boolean;
}) {
  const { t } = useAppTranslation();
  const initialSubject = canManage ? activeStudentSubject : profileSubject;
  const [selectedSubject, setSelectedSubject] = useState(selectedStudentSubject ?? initialSubject ?? practice.sessions[0]?.ownerSubject ?? "");
  const effectiveSelectedSubject = selectedStudentSubject ?? selectedSubject;
  const [saving, setSaving] = useState(false);
  const [continuedHome, setContinuedHome] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);
  const selected = practice.sessions.find((session) => session.ownerSubject === effectiveSelectedSubject) ?? practice.sessions[0] ?? null;
  const own = practice.sessions.find((session) => session.ownerSubject === profileSubject) ?? null;

  async function changeStatus(status: "ACTIVE" | "PAUSED" | "COMPLETED") {
    setSaving(true);
    try {
      onPracticeChange(await updateVocabularyPracticeStatus(practice.id, status));
    } finally {
      setSaving(false);
    }
  }

  async function continueAtHome() {
    const remaining = practice.sessions.filter((session) => session.completedItems < session.totalItems);
    if (remaining.length === 0) return;
    setSaving(true);
    setContinueError(null);
    try {
      await createVocabularyHomeworkAssignment({
        mode: practice.mode,
        sourcePracticeId: practice.id,
        studentSubjects: remaining.map((session) => session.ownerSubject),
        title: t("vocabulary.live.homeworkTitle"),
        wordLimit: 30,
      });
      setContinuedHome(true);
    } catch (caught) {
      setContinueError(caught instanceof Error ? caught.message : t("vocabulary.practice.errors.publish"));
    } finally {
      setSaving(false);
    }
  }

  async function giveHint() {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await giveVocabularyPracticeHint(selected.id);
      onPracticeChange(replaceSession(practice, updated));
    } finally {
      setSaving(false);
    }
  }

  async function requestHelp() {
    if (!own) return;
    setSaving(true);
    try {
      const updated = await requestVocabularyPracticeHelp(own.id);
      onPracticeChange(replaceSession(practice, updated));
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return own ? (
      <div className="grid gap-3">
        {practice.status === "PAUSED" ? (
          <p className="rounded-2xl border border-primary/20 bg-[#fff7f0] p-3 text-center text-sm font-black text-primary">{t("vocabulary.live.pausedForStudent")}</p>
        ) : null}
        <VocabularyPracticePlayer
          initialSession={own}
          onSessionChange={(session) => onPracticeChange(replaceSession(practice, session))}
          readOnly={practice.status === "PAUSED"}
        />
        <Button
          disabled={saving || own.helpRequested || own.status === "COMPLETED" || practice.status === "PAUSED"}
          onClick={() => void requestHelp()}
          type="button"
          variant="outline"
        >
          <CircleHelp className="h-4 w-4" />
          {own.helpRequested ? t("vocabulary.live.helpRequested") : t("vocabulary.live.requestHelp")}
        </Button>
        {practice.status === "COMPLETED" ? (
          <Button onClick={onClose} type="button" variant="outline">
            <ArrowLeft className="h-4 w-4" />
            {t("vocabulary.live.returnToLesson")}
          </Button>
        ) : null}
      </div>
    ) : (
      <div className="playsay-task-board playsay-material-loading"><Loader2 className="h-5 w-5 animate-spin text-primary" /><span>{t("vocabulary.live.joining")}</span></div>
    );
  }

  if (teacherPlayerOnly) {
    return selected ? (
      <div className="grid gap-3">
        <p className="text-center text-sm font-black text-muted-foreground">{selected.ownerName ?? selected.ownerSubject}</p>
        <VocabularyPracticePlayer initialSession={selected} readOnly />
      </div>
    ) : null;
  }

  const completed = practice.sessions.filter((session) => session.status === "COMPLETED").length;
  return (
    <section className="grid gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white p-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">{t("vocabulary.live.eyebrow")}</p>
          <h2 className="text-xl font-black">{t("vocabulary.live.title")}</h2>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">{t("vocabulary.live.completed", { completed, total: practice.sessions.length })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {practice.status === "PAUSED" ? (
            <Button disabled={saving} onClick={() => void changeStatus("ACTIVE")} type="button"><Play className="h-4 w-4" />{t("vocabulary.live.resume")}</Button>
          ) : (
            <Button disabled={saving || practice.status === "COMPLETED"} onClick={() => void changeStatus("PAUSED")} type="button" variant="outline"><Pause className="h-4 w-4" />{t("vocabulary.live.pause")}</Button>
          )}
          <Button disabled={saving || practice.status === "COMPLETED"} onClick={() => void changeStatus("COMPLETED")} type="button" variant="outline"><Square className="h-4 w-4" />{t("vocabulary.live.stop")}</Button>
          {practice.status === "COMPLETED" && practice.sessions.some((session) => session.completedItems < session.totalItems) ? (
            <Button disabled={saving || continuedHome} onClick={() => void continueAtHome()} type="button">
              {continuedHome ? <Check className="h-4 w-4" /> : <Home className="h-4 w-4" />}
              {continuedHome ? t("vocabulary.live.continuedHome") : t("vocabulary.live.continueHome")}
            </Button>
          ) : null}
          {practice.status === "COMPLETED" ? (
            <Button onClick={onClose} type="button" variant="outline">
              <ArrowLeft className="h-4 w-4" />
              {t("vocabulary.live.returnToLesson")}
            </Button>
          ) : null}
        </div>
      </header>
      {continueError ? <p className="rounded-2xl border border-destructive/25 bg-destructive/5 p-3 text-sm font-bold text-destructive">{continueError}</p> : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(17rem,22rem)_1fr]">
        <div className="grid content-start gap-2">
          {practice.sessions.map((session) => (
            <button className="rounded-2xl border border-border bg-white p-3 text-left" data-active={session.ownerSubject === selected?.ownerSubject ? "true" : "false"} key={session.id} onClick={() => setSelectedSubject(session.ownerSubject)} type="button">
              <span className="flex items-center justify-between gap-2">
                <strong className="truncate">{session.ownerName ?? session.ownerSubject}</strong>
                {session.status === "COMPLETED" ? <Check className="h-4 w-4 text-[#197a45]" /> : <Users className="h-4 w-4 text-primary" />}
              </span>
              <span className="mt-2 block text-xs font-bold text-muted-foreground">
                {t("vocabulary.live.studentProgress", {
                  accuracy: session.accuracy === null || session.accuracy === undefined ? "—" : `${Math.round(session.accuracy * 100)}%`,
                  completed: session.completedItems,
                  total: session.totalItems,
                })}
              </span>
              {session.helpRequested ? (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#fff1e7] px-2 py-1 text-xs font-black text-primary">
                  <CircleHelp className="h-3.5 w-3.5" />
                  {t("vocabulary.live.helpRequested")}
                </span>
              ) : null}
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${percent(session)}%` }} />
              </span>
            </button>
          ))}
        </div>
        {selected ? (
          <div className="grid content-start gap-3">
            <VocabularyPracticePlayer initialSession={selected} readOnly />
            <Button disabled={saving || selected.status === "COMPLETED"} onClick={() => void giveHint()} type="button" variant="outline">
              {t("vocabulary.live.giveHint")}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function replaceSession(practice: VocabularyPractice, session: VocabularyPracticeSession): VocabularyPractice {
  return {
    ...practice,
    sessions: practice.sessions.map((current) => current.id === session.id ? session : current),
    updatedAt: session.updatedAt,
  };
}

function percent(session: VocabularyPracticeSession): number {
  return session.totalItems > 0 ? Math.round((session.completedItems / session.totalItems) * 100) : 100;
}
