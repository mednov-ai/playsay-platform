import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Clock3, Loader2, MessageCircle, Mic, PhoneOff, Plus, RefreshCw, RotateCcw, Search, Sparkles } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  appendTurnEvaluation,
  createAiTutorSession,
  fetchAiTutorCatalog,
  fetchDialogAllowance,
  fetchTeacherDialogAllowances,
  finishAiTutorSession,
  grantTeacherDialogCredits,
  type AgePolicy,
  type AiTutorSession,
  type ConversationScenario,
  type DialogAllowance,
  type FeedbackMode,
  type StudentDialogAllowance,
  type TurnEvaluation,
  type TutorPersona,
} from "../../../shared/api/aiTutor";
import { ApiError } from "../../../shared/api/errors";
import type { AppUserProfile } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import type { AvatarActivity } from "../model/avatarAnimation";
import { connectRealtimeConversation, type RealtimeConversation } from "../model/realtimeConversation";
import { AiTutorAvatarStage, TutorPortrait } from "./AiTutorAvatarStage";

export const tutorAccentTranslationKeys: Record<string, string> = {
  GENERAL_AMERICAN: "aiTutor.accents.generalAmerican",
  STANDARD_BRITISH: "aiTutor.accents.standardBritish",
};

type AiTutorPanelProps = {
  appProfile: AppUserProfile | null;
  onOpenProfile: () => void;
};

export function AiTutorPanel({ appProfile, onOpenProfile }: AiTutorPanelProps) {
  const { t } = useAppTranslation();
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>("SIGNIFICANT");
  const [personas, setPersonas] = useState<TutorPersona[]>([]);
  const [scenarios, setScenarios] = useState<ConversationScenario[]>([]);
  const [personaId, setPersonaId] = useState("");
  const [scenarioId, setScenarioId] = useState("");
  const [freeTopic, setFreeTopic] = useState("");
  const [session, setSession] = useState<AiTutorSession | null>(null);
  const [allowance, setAllowance] = useState<DialogAllowance | null>(null);
  const [teacherAllowances, setTeacherAllowances] = useState<StudentDialogAllowance[]>([]);
  const [teacherAllowancesLoading, setTeacherAllowancesLoading] = useState(false);
  const [teacherAllowanceMessage, setTeacherAllowanceMessage] = useState<string | null>(null);
  const [grantingStudentId, setGrantingStudentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [avatarActivity, setAvatarActivity] = useState<AvatarActivity>("idle");
  const [remoteAudioStream, setRemoteAudioStream] = useState<MediaStream | null>(null);
  const [evaluation, setEvaluation] = useState<TurnEvaluation | null>(null);
  const [summary, setSummary] = useState<NonNullable<AiTutorSession["summary"]> | null>(null);
  const avatarAudioContext = useRef<AudioContext | null>(null);
  const realtime = useRef<RealtimeConversation | null>(null);
  const pendingStartRequestId = useRef<string | null>(null);
  const isStudent = appProfile?.roles.includes("STUDENT") ?? false;
  const canManageDialogAllowances = appProfile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
  const needsBirthDate = isStudent && !appProfile?.birthDate;
  const canLoadCatalog = Boolean(appProfile) && !needsBirthDate;
  const agePolicy = agePolicyFromBirthDate(appProfile?.birthDate);

  useEffect(() => () => {
    realtime.current?.close();
    closeAvatarAudioContext();
  }, []);

  useEffect(() => {
    if (!canLoadCatalog) {
      setPersonas([]);
      setScenarios([]);
      setAllowance(null);
      setPersonaId("");
      setScenarioId("");
      return;
    }

    let active = true;
    setLoading(true);
    void fetchAiTutorCatalog()
      .then((catalog) => {
        if (!active) return;
        setPersonas(catalog.personas);
        setScenarios(catalog.scenarios);
        setAllowance(catalog.allowance);
        setPersonaId((current) => catalog.personas.some(({ id }) => id === current) ? current : (catalog.personas[0]?.id ?? ""));
        setScenarioId((current) => catalog.scenarios.some(({ id }) => id === current) ? current : (catalog.scenarios[0]?.id ?? ""));
        setMessage(null);
      })
      .catch(() => active && setMessage(t("aiTutor.errors.catalog")))
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [canLoadCatalog, appProfile?.birthDate, t]);

  const loadTeacherAllowances = useCallback(async () => {
    if (!canManageDialogAllowances) {
      setTeacherAllowances([]);
      return;
    }
    setTeacherAllowancesLoading(true);
    try {
      setTeacherAllowances(await fetchTeacherDialogAllowances());
      setTeacherAllowanceMessage(null);
    } catch {
      setTeacherAllowanceMessage(t("aiTutor.allowance.teacher.loadError"));
    } finally {
      setTeacherAllowancesLoading(false);
    }
  }, [canManageDialogAllowances, t]);

  useEffect(() => {
    void loadTeacherAllowances();
  }, [loadTeacherAllowances]);

  const selectedScenario = scenarios.find(({ id }) => id === scenarioId);
  const selectedPersona = personas.find(({ id }) => id === personaId);

  async function start() {
    if (allowance && !allowance.canStart) return;
    closeAvatarAudioContext();
    if (typeof AudioContext !== "undefined") {
      try {
        avatarAudioContext.current = new AudioContext();
        void avatarAudioContext.current.resume().catch(() => undefined);
      } catch {
        avatarAudioContext.current = null;
      }
    }
    setLoading(true);
    const clientRequestId = pendingStartRequestId.current ?? crypto.randomUUID();
    pendingStartRequestId.current = clientRequestId;
    let createdSession: AiTutorSession | null = null;
    try {
      const created = await createAiTutorSession({
        personaId,
        scenarioId,
        feedbackMode,
        freeTopic: selectedScenario?.freeConversation ? freeTopic : undefined,
        clientRequestId,
      });
      createdSession = created;
      setSummary(null);
      setAllowance(created.allowance ?? allowance);
      if (created.realtime?.available && created.realtime.clientSecret) {
        realtime.current = await connectRealtimeConversation({
          clientSecret: created.realtime.clientSecret,
          model: created.realtime.model,
          onActivityChange: setAvatarActivity,
          onError: () => setMessage(t("aiTutor.errors.connection")),
          onEvaluation: (next, eventId) => {
            const turnEvaluation = { ...next, clientTurnId: eventId };
            if (feedbackMode !== "SESSION_END") setEvaluation(turnEvaluation);
            void appendTurnEvaluation(created.id, eventId, turnEvaluation);
          },
          onRemoteAudioStream: setRemoteAudioStream,
        });
        setSession(created);
        pendingStartRequestId.current = null;
        setMessage(null);
      } else {
        closeAvatarAudioContext();
        setSession(created);
        pendingStartRequestId.current = null;
        setMessage(t("aiTutor.session.demoNotice"));
      }
    } catch (caught) {
      closeAvatarAudioContext();
      realtime.current?.close();
      realtime.current = null;
      setRemoteAudioStream(null);
      if (createdSession) {
        pendingStartRequestId.current = null;
        const completed = await finishAiTutorSession(createdSession.id).catch(() => null);
        const refreshed = completed?.allowance ?? await fetchDialogAllowance().catch(() => allowance);
        setAllowance(refreshed);
        setSession(null);
        setMessage(t("aiTutor.errors.connection"));
      } else if (caught instanceof ApiError && caught.errorCode === "AI_DIALOG_CREDITS_EXHAUSTED") {
        setSession(null);
        pendingStartRequestId.current = null;
        const refreshed = await fetchDialogAllowance().catch(() => null);
        if (refreshed) setAllowance(refreshed);
        setMessage(t("aiTutor.allowance.student.exhausted"));
      } else if (caught instanceof ApiError && caught.errorCode === "AI_DIALOG_ALREADY_ACTIVE") {
        setSession(null);
        pendingStartRequestId.current = null;
        setMessage(t("aiTutor.allowance.student.activeElsewhere"));
      } else {
        setSession(null);
        setMessage(t("aiTutor.errors.start"));
      }
    } finally {
      setLoading(false);
    }
  }

  async function finish() {
    if (!session) return;
    realtime.current?.close();
    realtime.current = null;
    closeAvatarAudioContext();
    setAvatarActivity("idle");
    setRemoteAudioStream(null);
    setLoading(true);
    try {
      const completed = await finishAiTutorSession(session.id);
      setSummary(completed.summary ?? null);
      const refreshedAllowance = completed.allowance ?? await fetchDialogAllowance().catch(() => allowance);
      setAllowance(refreshedAllowance);
      setSession(null);
      setEvaluation(null);
      setMessage(t("aiTutor.session.saved"));
    } catch {
      setMessage(t("aiTutor.errors.finish"));
    } finally {
      setLoading(false);
    }
  }

  async function grantDialogs(studentUserId: string, quantity: number) {
    setGrantingStudentId(studentUserId);
    try {
      const updated = await grantTeacherDialogCredits(studentUserId, quantity, crypto.randomUUID());
      setTeacherAllowances((current) => current.map((entry) => entry.studentUserId === studentUserId ? updated : entry));
      setTeacherAllowanceMessage(t("aiTutor.allowance.teacher.grantSuccess", { count: quantity, name: updated.displayName }));
    } catch {
      setTeacherAllowanceMessage(t("aiTutor.allowance.teacher.grantError"));
    } finally {
      setGrantingStudentId(null);
    }
  }

  return (
    <div className="grid gap-5">
      <section className="overflow-hidden rounded-3xl border border-border bg-white/90 shadow-sm dark:bg-zinc-950/80">
        <div className="grid min-h-[36rem] lg:grid-cols-[minmax(0,1.2fr)_minmax(22rem,.8fr)]">
        <TutorAvatar
          activity={avatarActivity}
          audioContext={avatarAudioContext.current}
          audioStream={remoteAudioStream}
          persona={selectedPersona}
          sessionActive={Boolean(session)}
        />
        <div className="flex flex-col gap-5 p-5 sm:p-7">
          <header>
            <span className="inline-flex items-center gap-2 text-sm font-bold text-primary">
              <Sparkles className="h-4 w-4" />
              {t("aiTutor.eyebrow")}
            </span>
            <h2 className="mt-2 text-2xl font-black">{t("aiTutor.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("aiTutor.subtitle")}</p>
          </header>

          {needsBirthDate ? (
            <ProfileRequired onOpenProfile={onOpenProfile} />
          ) : session ? (
            <ActiveSession
              evaluation={evaluation}
              feedbackMode={feedbackMode}
              loading={loading}
              onClearEvaluation={() => setEvaluation(null)}
              onFinish={() => void finish()}
              onRepeat={() => realtime.current?.repeat()}
              scenario={selectedScenario}
              expiresAt={session.expiresAt}
            />
          ) : (
            <SessionSetup
              agePolicy={isStudent ? agePolicy : "ADULT"}
              allowance={allowance}
              feedbackMode={feedbackMode}
              freeTopic={freeTopic}
              loading={loading}
              onFeedbackModeChange={setFeedbackMode}
              onFreeTopicChange={setFreeTopic}
              onPersonaChange={setPersonaId}
              onScenarioChange={setScenarioId}
              onStart={() => void start()}
              personaId={personaId}
              personas={personas}
              scenarioId={scenarioId}
              scenarios={scenarios}
              selectedScenario={selectedScenario}
              summary={summary}
            />
          )}
          {message ? <p className="rounded-xl bg-muted px-3 py-2 text-sm" role="status">{message}</p> : null}
        </div>
        </div>
      </section>
      {canManageDialogAllowances ? (
        <TeacherDialogAllowancesPanel
          allowances={teacherAllowances}
          grantingStudentId={grantingStudentId}
          loading={teacherAllowancesLoading}
          message={teacherAllowanceMessage}
          onGrant={grantDialogs}
          onRefresh={() => void loadTeacherAllowances()}
        />
      ) : null}
    </div>
  );

  function closeAvatarAudioContext() {
    const context = avatarAudioContext.current;
    avatarAudioContext.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  }
}

function TutorAvatar({ activity, audioContext, audioStream, persona, sessionActive }: {
  activity: AvatarActivity;
  audioContext: AudioContext | null;
  audioStream: MediaStream | null;
  persona?: TutorPersona;
  sessionActive: boolean;
}) {
  const { t } = useAppTranslation();
  return (
    <div className="relative min-h-80 overflow-hidden bg-[#fff5e9] dark:bg-[#21160f]">
      <AiTutorAvatarStage activity={activity} audioContext={audioContext} audioStream={audioStream} persona={persona} />
      <div className="absolute inset-x-4 bottom-4 z-10 rounded-2xl border border-white/70 bg-white/85 p-4 shadow-lg backdrop-blur dark:border-white/10 dark:bg-black/70">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">
          {sessionActive ? t("aiTutor.session.live") : t("aiTutor.avatar.label")}
        </p>
        <strong className="text-lg">{persona?.name ?? t("aiTutor.avatar.fallback")}</strong>
        <p className="text-sm text-muted-foreground">
          {sessionActive ? t("aiTutor.session.prompt") : t("aiTutor.avatar.hint")}
        </p>
      </div>
    </div>
  );
}

function ProfileRequired({ onOpenProfile }: { onOpenProfile: () => void }) {
  const { t } = useAppTranslation();
  return (
    <div className="grid gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <strong>{t("aiTutor.profileRequired.title")}</strong>
      <p className="text-sm text-muted-foreground">{t("aiTutor.profileRequired.body")}</p>
      <Button className="justify-self-start" onClick={onOpenProfile} type="button" variant="outline">
        {t("aiTutor.profileRequired.action")}
      </Button>
    </div>
  );
}

export function ActiveSession({ evaluation, expiresAt, feedbackMode, loading, onClearEvaluation, onFinish, onRepeat, scenario }: {
  evaluation: TurnEvaluation | null;
  expiresAt?: string | null;
  feedbackMode: FeedbackMode;
  loading: boolean;
  onClearEvaluation: () => void;
  onFinish: () => void;
  onRepeat: () => void;
  scenario?: ConversationScenario;
}) {
  const { t } = useAppTranslation();
  const remainingSeconds = useDialogRemainingSeconds(expiresAt, onFinish);
  const expiringSoon = remainingSeconds !== null && remainingSeconds <= 60;
  return (
    <div className="flex flex-1 flex-col justify-between gap-5">
      <div className="grid gap-3">
        <div className="rounded-2xl border border-border bg-muted/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold">{scenario?.title}</p>
            {remainingSeconds !== null ? (
              <span
                aria-label={t("aiTutor.allowance.student.timeRemainingLabel", { time: formatDialogTime(remainingSeconds) })}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-extrabold ${expiringSoon ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-background"}`}
                data-testid="ai-tutor-dialog-countdown"
              >
                <Clock3 className="h-3.5 w-3.5" />
                {formatDialogTime(remainingSeconds)}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{scenario?.conversationGoal}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t(`aiTutor.feedback.${feedbackMode}`)}</p>
          {expiringSoon ? <p className="mt-2 text-xs font-bold text-primary" role="status">{t("aiTutor.allowance.student.timeWarning")}</p> : null}
        </div>
        <EvaluationCard evaluation={evaluation} />
      </div>
      <div className="flex flex-wrap gap-2">
        {evaluation?.verdict === "IMPROVE" ? <Button onClick={onRepeat} type="button" variant="outline"><RotateCcw className="h-4 w-4" />{t("aiTutor.session.repeat")}</Button> : null}
        {evaluation ? <Button onClick={onClearEvaluation} type="button" variant="outline">{t("aiTutor.session.continue")}</Button> : null}
        <Button disabled={loading} onClick={onFinish} type="button"><PhoneOff className="h-4 w-4" />{t("aiTutor.session.finish")}</Button>
      </div>
    </div>
  );
}

function EvaluationCard({ evaluation }: { evaluation: TurnEvaluation | null }) {
  const { t } = useAppTranslation();
  if (!evaluation) return null;
  if (evaluation.verdict === "ACCEPTED") {
    return <article aria-live="polite" className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950"><span className="text-xs font-black uppercase tracking-wide">{t("aiTutor.evaluation.accepted")}</span><p className="mt-1 text-sm">{evaluation.encouragement}</p></article>;
  }
  return <article aria-live="polite" className="rounded-2xl border border-primary/30 bg-primary/5 p-4"><span className="text-xs font-black uppercase tracking-wide text-primary">{t("aiTutor.evaluation.improve")}</span><p className="mt-2 text-sm text-muted-foreground line-through">{evaluation.original}</p><p className="font-bold">{evaluation.improved}</p><p className="mt-2 text-sm">{evaluation.explanation}</p></article>;
}

type SessionSetupProps = {
  agePolicy: AgePolicy;
  allowance: DialogAllowance | null;
  feedbackMode: FeedbackMode;
  freeTopic: string;
  loading: boolean;
  onFeedbackModeChange: (mode: FeedbackMode) => void;
  onFreeTopicChange: (topic: string) => void;
  onPersonaChange: (id: string) => void;
  onScenarioChange: (id: string) => void;
  onStart: () => void;
  personaId: string;
  personas: TutorPersona[];
  scenarioId: string;
  scenarios: ConversationScenario[];
  selectedScenario?: ConversationScenario;
  summary: NonNullable<AiTutorSession["summary"]> | null;
};

function SessionSetup(props: SessionSetupProps) {
  const { t } = useAppTranslation();
  return (
    <div className="grid gap-4">
      {props.summary ? <SessionSummary summary={props.summary} /> : null}
      <DialogAllowanceCard allowance={props.allowance} />
      <Field label={t("aiTutor.fields.age")}>
        <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm font-semibold">
          {t(`aiTutor.age.${props.agePolicy}`)} · {t("aiTutor.age.fromProfile")}
        </div>
      </Field>
      <TutorPersonaPicker
        disabled={props.loading}
        onPersonaChange={props.onPersonaChange}
        personaId={props.personaId}
        personas={props.personas}
      />
      <Field label={t("aiTutor.fields.scenario")}>
        <select className="h-11 w-full rounded-xl border border-border bg-background px-3" onChange={(event) => props.onScenarioChange(event.target.value)} value={props.scenarioId}>
          {props.scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.title} · {scenario.cefrLevel}</option>)}
        </select>
      </Field>
      {props.selectedScenario?.freeConversation ? (
        <Field label={t("aiTutor.fields.topic")}>
          <input className="h-11 w-full rounded-xl border border-border bg-background px-3" maxLength={240} onChange={(event) => props.onFreeTopicChange(event.target.value)} placeholder={t("aiTutor.fields.topicPlaceholder")} value={props.freeTopic} />
        </Field>
      ) : null}
      <Field label={t("aiTutor.fields.feedback")}>
        <div className="grid grid-cols-3 gap-2">
          {(["EVERY_TURN", "SIGNIFICANT", "SESSION_END"] as const).map((mode) => (
            <button className="rounded-xl border border-border p-2 text-xs font-bold data-[active=true]:border-primary data-[active=true]:bg-primary/10" data-active={props.feedbackMode === mode} key={mode} onClick={() => props.onFeedbackModeChange(mode)} type="button">
              {t(`aiTutor.feedbackShort.${mode}`)}
            </button>
          ))}
        </div>
      </Field>
      <Button disabled={props.loading || !props.personaId || !props.scenarioId || props.allowance?.canStart === false} onClick={props.onStart} type="button">
        {props.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
        {t("aiTutor.actions.start")}
      </Button>
    </div>
  );
}

export function DialogAllowanceCard({ allowance }: { allowance: DialogAllowance | null }) {
  const { t } = useAppTranslation();
  if (!allowance?.limited) return null;
  const remaining = allowance.remainingDialogs ?? 0;
  const minutes = Math.ceil(allowance.maxDurationSeconds / 60);
  const exhausted = remaining <= 0;
  const activeElsewhere = !exhausted && !allowance.canStart;
  return (
    <aside
      className={`rounded-2xl border p-4 ${exhausted ? "border-primary/30 bg-primary/5" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}
      data-testid="ai-tutor-dialog-allowance"
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${exhausted ? "bg-primary/10 text-primary" : "bg-emerald-100 text-emerald-700"}`}>
          <MessageCircle className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <strong className="block text-sm">
            {exhausted
              ? t("aiTutor.allowance.student.exhaustedTitle")
              : activeElsewhere
                ? t("aiTutor.allowance.student.activeTitle")
              : t("aiTutor.allowance.student.available", { count: remaining })}
          </strong>
          <p className={`mt-1 text-xs leading-5 ${exhausted ? "text-muted-foreground" : "text-emerald-800"}`}>
            {exhausted
              ? t("aiTutor.allowance.student.contactTeacher", { name: allowance.teacherDisplayName ?? t("aiTutor.allowance.student.teacherFallback") })
              : activeElsewhere
                ? t("aiTutor.allowance.student.activeElsewhere")
              : t("aiTutor.allowance.student.duration", { minutes })}
          </p>
        </div>
      </div>
    </aside>
  );
}

export function TutorPersonaPicker({ disabled, onPersonaChange, personaId, personas }: {
  disabled: boolean;
  onPersonaChange: (id: string) => void;
  personaId: string;
  personas: TutorPersona[];
}) {
  const { t } = useAppTranslation();

  return (
    <fieldset className="grid gap-1.5" data-testid="ai-tutor-persona-picker">
      <legend className="mb-1.5 text-sm font-bold">{t("aiTutor.fields.persona")}</legend>
      <div className="grid grid-cols-3 gap-2">
        {personas.map((persona) => {
          const selected = persona.id === personaId;
          const accentKey = tutorAccentTranslationKeys[persona.accent];
          return (
            <label
              className={`grid min-w-0 cursor-pointer content-start justify-items-center gap-2 rounded-2xl border p-2 text-center transition focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 ${selected ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background hover:border-primary/50"} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
              data-persona-id={persona.id}
              data-selected={selected}
              data-testid={`ai-tutor-persona-card-${persona.id}`}
              key={persona.id}
            >
              <input
                checked={selected}
                className="sr-only"
                disabled={disabled}
                name="ai-tutor-persona"
                onChange={() => onPersonaChange(persona.id)}
                type="radio"
                value={persona.id}
              />
              <TutorPortrait
                className="block h-14 w-14 overflow-hidden rounded-xl border border-white/80 bg-muted shadow-sm dark:border-white/10"
                imageClassName="h-full w-full object-cover"
                persona={persona}
              />
              <span className="min-w-0">
                <strong className="block truncate text-sm">{persona.name}</strong>
                <span className="mt-0.5 block text-[0.68rem] leading-tight text-muted-foreground">
                  {accentKey ? t(accentKey) : persona.accent}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function TeacherDialogAllowancesPanel({ allowances, grantingStudentId, loading, message, onGrant, onRefresh }: {
  allowances: StudentDialogAllowance[];
  grantingStudentId: string | null;
  loading: boolean;
  message: string | null;
  onGrant: (studentUserId: string, quantity: number) => Promise<void>;
  onRefresh: () => void;
}) {
  const { t } = useAppTranslation();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleAllowances = normalizedQuery
    ? allowances.filter((entry) => `${entry.displayName} ${entry.studentSubject}`.toLowerCase().includes(normalizedQuery))
    : allowances;

  return (
    <section
      className="rounded-3xl border border-border bg-white/90 p-5 shadow-sm dark:bg-zinc-950/80 sm:p-7"
      data-testid="ai-tutor-teacher-allowances"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="text-xs font-black uppercase tracking-[0.14em] text-primary">{t("aiTutor.allowance.teacher.eyebrow")}</span>
          <h2 className="mt-1 text-xl font-black">{t("aiTutor.allowance.teacher.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("aiTutor.allowance.teacher.subtitle")}</p>
        </div>
        <Button disabled={loading} onClick={onRefresh} type="button" variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t("common.actions.refresh")}
        </Button>
      </div>

      <label className="relative mt-5 block">
        <span className="sr-only">{t("aiTutor.allowance.teacher.searchLabel")}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-primary"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("aiTutor.allowance.teacher.searchPlaceholder")}
          type="search"
          value={query}
        />
      </label>

      {message ? <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-sm" role="status">{message}</p> : null}

      <div className="mt-4 grid gap-3">
        {!loading && visibleAllowances.length === 0 ? (
          <p className="rounded-2xl border border-border bg-muted/50 p-4 text-sm font-semibold text-muted-foreground">
            {normalizedQuery ? t("aiTutor.allowance.teacher.noSearchResults") : t("aiTutor.allowance.teacher.empty")}
          </p>
        ) : visibleAllowances.map((entry) => (
          <DialogGrantRow
            busy={grantingStudentId === entry.studentUserId}
            entry={entry}
            key={entry.studentUserId}
            onGrant={onGrant}
          />
        ))}
      </div>
    </section>
  );
}

function DialogGrantRow({ busy, entry, onGrant }: {
  busy: boolean;
  entry: StudentDialogAllowance;
  onGrant: (studentUserId: string, quantity: number) => Promise<void>;
}) {
  const { t } = useAppTranslation();
  const [quantity, setQuantity] = useState("1");
  const parsedQuantity = Number(quantity);
  const validQuantity = Number.isInteger(parsedQuantity) && parsedQuantity >= 1 && parsedQuantity <= 100;

  return (
    <article className="grid gap-4 rounded-2xl border border-border bg-muted/35 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center" data-student-id={entry.studentUserId}>
      <div className="min-w-0">
        <strong className="block truncate">{entry.displayName}</strong>
        <span className="mt-1 block text-sm font-semibold text-muted-foreground">
          {t("aiTutor.allowance.teacher.remaining", { count: entry.remainingDialogs })}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div aria-label={t("aiTutor.allowance.teacher.presetsLabel")} className="flex gap-1" role="group">
          {[1, 5, 10].map((preset) => (
            <button
              className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs font-extrabold hover:border-primary disabled:opacity-50"
              disabled={busy}
              key={preset}
              onClick={() => setQuantity(String(preset))}
              type="button"
            >
              +{preset}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor={`ai-dialog-grant-${entry.studentUserId}`}>{t("aiTutor.allowance.teacher.quantityLabel")}</label>
        <input
          className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-center text-sm font-bold outline-none focus:border-primary"
          disabled={busy}
          id={`ai-dialog-grant-${entry.studentUserId}`}
          inputMode="numeric"
          max={100}
          min={1}
          onChange={(event) => setQuantity(event.target.value)}
          type="number"
          value={quantity}
        />
        <Button disabled={busy || !validQuantity} onClick={() => void onGrant(entry.studentUserId, parsedQuantity)} type="button">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t("aiTutor.allowance.teacher.add")}
        </Button>
      </div>
    </article>
  );
}

function SessionSummary({ summary }: { summary: NonNullable<AiTutorSession["summary"]> }) {
  const { t } = useAppTranslation();
  return (
    <article className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
      <p className="font-black">{t("aiTutor.summary.title")}</p>
      <p className="mt-1 text-sm">{t("aiTutor.summary.body", { accepted: summary.acceptedTurns, improved: summary.improvedTurns, goals: summary.goalsMet })}</p>
      {summary.recurringIssues.length ? <p className="mt-2 text-xs font-bold">{t("aiTutor.summary.focus", { issues: summary.recurringIssues.join(", ") })}</p> : null}
    </article>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className="grid gap-1.5 text-sm font-bold"><span>{label}</span>{children}</label>;
}

export function dialogRemainingSeconds(expiresAt?: string | null, nowMs = Date.now()): number | null {
  if (!expiresAt) return null;
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) return null;
  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1_000));
}

function useDialogRemainingSeconds(expiresAt: string | null | undefined, onExpired: () => void): number | null {
  const [remainingSeconds, setRemainingSeconds] = useState(() => dialogRemainingSeconds(expiresAt));
  const onExpiredRef = useRef(onExpired);
  const handledExpiryRef = useRef<string | null>(null);
  onExpiredRef.current = onExpired;

  useEffect(() => {
    const tick = () => {
      const next = dialogRemainingSeconds(expiresAt);
      setRemainingSeconds(next);
      if (next === 0 && expiresAt && handledExpiryRef.current !== expiresAt) {
        handledExpiryRef.current = expiresAt;
        onExpiredRef.current();
      }
    };
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  return remainingSeconds;
}

function formatDialogTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function agePolicyFromBirthDate(birthDate?: string | null, today = new Date()): AgePolicy {
  if (!birthDate) return "ADULT";
  const parsed = new Date(`${birthDate}T00:00:00Z`);
  let age = today.getUTCFullYear() - parsed.getUTCFullYear();
  const birthdayNotReached = today.getUTCMonth() < parsed.getUTCMonth()
    || (today.getUTCMonth() === parsed.getUTCMonth() && today.getUTCDate() < parsed.getUTCDate());
  if (birthdayNotReached) age -= 1;
  if (age < 13) return "CHILD";
  if (age < 18) return "TEEN";
  return "ADULT";
}
