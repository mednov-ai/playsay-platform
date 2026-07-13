import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Mic, PhoneOff, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  appendTurnEvaluation,
  createAiTutorSession,
  fetchAiTutorCatalog,
  finishAiTutorSession,
  type AgePolicy,
  type AiTutorSession,
  type ConversationScenario,
  type FeedbackMode,
  type TurnEvaluation,
  type TutorPersona,
} from "../../../shared/api/aiTutor";
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
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [avatarActivity, setAvatarActivity] = useState<AvatarActivity>("idle");
  const [remoteAudioStream, setRemoteAudioStream] = useState<MediaStream | null>(null);
  const [evaluation, setEvaluation] = useState<TurnEvaluation | null>(null);
  const [summary, setSummary] = useState<NonNullable<AiTutorSession["summary"]> | null>(null);
  const avatarAudioContext = useRef<AudioContext | null>(null);
  const realtime = useRef<RealtimeConversation | null>(null);
  const isStudent = appProfile?.roles.includes("STUDENT") ?? false;
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
        setPersonaId((current) => catalog.personas.some(({ id }) => id === current) ? current : (catalog.personas[0]?.id ?? ""));
        setScenarioId((current) => catalog.scenarios.some(({ id }) => id === current) ? current : (catalog.scenarios[0]?.id ?? ""));
        setMessage(null);
      })
      .catch(() => active && setMessage(t("aiTutor.errors.catalog")))
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [canLoadCatalog, appProfile?.birthDate, t]);

  const selectedScenario = scenarios.find(({ id }) => id === scenarioId);
  const selectedPersona = personas.find(({ id }) => id === personaId);

  async function start() {
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
    try {
      const created = await createAiTutorSession({
        personaId,
        scenarioId,
        feedbackMode,
        freeTopic: selectedScenario?.freeConversation ? freeTopic : undefined,
      });
      setSummary(null);
      setSession(created);
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
        setMessage(null);
      } else {
        closeAvatarAudioContext();
        setMessage(t("aiTutor.session.demoNotice"));
      }
    } catch {
      closeAvatarAudioContext();
      setMessage(t("aiTutor.errors.start"));
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
      setSession(null);
      setEvaluation(null);
      setMessage(t("aiTutor.session.saved"));
    } catch {
      setMessage(t("aiTutor.errors.finish"));
    } finally {
      setLoading(false);
    }
  }

  return (
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
            />
          ) : (
            <SessionSetup
              agePolicy={isStudent ? agePolicy : "ADULT"}
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

function ActiveSession({ evaluation, feedbackMode, loading, onClearEvaluation, onFinish, onRepeat, scenario }: {
  evaluation: TurnEvaluation | null;
  feedbackMode: FeedbackMode;
  loading: boolean;
  onClearEvaluation: () => void;
  onFinish: () => void;
  onRepeat: () => void;
  scenario?: ConversationScenario;
}) {
  const { t } = useAppTranslation();
  return (
    <div className="flex flex-1 flex-col justify-between gap-5">
      <div className="grid gap-3">
        <div className="rounded-2xl border border-border bg-muted/40 p-4">
          <p className="font-bold">{scenario?.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{scenario?.conversationGoal}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t(`aiTutor.feedback.${feedbackMode}`)}</p>
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
      <Button disabled={props.loading || !props.personaId || !props.scenarioId} onClick={props.onStart} type="button">
        {props.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
        {t("aiTutor.actions.start")}
      </Button>
    </div>
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
