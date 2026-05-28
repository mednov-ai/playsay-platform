import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import {
  ConnectionStateToast,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  StartMediaButton,
  TrackToggle,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import {
  AlertCircle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Eraser,
  Loader2,
  MousePointer2,
  PenLine,
  PhoneOff,
  Plus,
  Radio,
  ScreenShare,
  Send,
  Undo2,
  Users,
  Video,
} from "lucide-react";
import { canAssignLessons } from "../../../entities/workspace/model";
import {
  formatLessonRange,
  formatLessonType,
  formatParticipantCount,
} from "../../../entities/schedule/model";
import {
  fetchScheduledLessonMaterialAnnotation,
  fetchScheduledLessonMaterial,
  fetchScheduledLessonMaterialSubmission,
  fetchScheduledLessonMaterialSubmissions,
  saveScheduledLessonMaterialAnnotation,
  saveScheduledLessonMaterialSubmission,
  type LessonMaterial,
  type LessonMaterialJson,
  type LessonMaterialSubmission,
  type MeProfile,
  type ScheduledLesson,
} from "../../../shared/api/playsay";
import { Button } from "../../../components/ui/button";
import type { LessonRoomSession } from "../model/session";
import {
  AnnotationToolButton,
  AssignmentStub,
  FallbackLessonDocument,
  LessonMaterialDocumentView,
  averageSubmissionScore,
  formatMaterialScore,
  formatSubmissionTime,
  materialAnswersFromSubmission,
  materialBlockLabel,
  materialDocumentBlocks,
  materialLiveScore,
  materialSubmissionAssessmentSummary,
  materialSubmissionUserLabel,
  type MaterialAnswerBlock,
  type MaterialAnswerState,
} from "../../materials";

type AnnotationTool = "pointer" | "pen" | "eraser";

type AnnotationPoint = {
  x: number;
  y: number;
};

type AnnotationStroke = {
  color: string;
  id: string;
  points: AnnotationPoint[];
};

type ClassroomTrackReference = ReturnType<typeof useTracks>[number];
type ClassroomStripLayout = "single" | "row";
type ClassroomVideoMode = "lesson" | "videoOnly";
export function LiveLessonExperience({
  materials,
  onAssignMaterial,
  onLeave,
  profile,
  session,
}: {
  materials: LessonMaterial[];
  onAssignMaterial: (lessonId: string, materialId: string | null) => Promise<ScheduledLesson | null>;
  onLeave: () => void;
  profile: MeProfile | null;
  session: LessonRoomSession;
}) {
  const displayName = profile?.name ?? profile?.username ?? "Участник";
  const lessonTypeLabel = formatLessonType(session.lessonType);
  const canManageLesson = canAssignLessons(profile);
  const videoOnly = !session.materialId && !canManageLesson;

  return (
    <div className="playsay-classroom-shell" data-video-only={videoOnly ? "true" : "false"}>
      <section className="playsay-video-rail">
        <div className="playsay-video-header">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-extrabold text-primary-foreground">
                <Radio className="h-3.5 w-3.5" />
                В эфире
              </span>
              <span className="playsay-video-type-badge rounded-full border border-white/15 px-2.5 py-1 text-xs font-extrabold text-white/80">
                {lessonTypeLabel}
              </span>
            </div>
            <h1 className="mt-2 truncate text-2xl font-black tracking-normal">{session.lessonTitle}</h1>
            <p className="mt-1 truncate text-sm font-semibold text-white/60">
              {session.courseTitle ?? "Play&Say"} · {formatLessonRange(session.lessonStartsAt, session.lessonEndsAt)}
            </p>
          </div>
          <Button className="playsay-lesson-exit" onClick={onLeave} type="button" variant="outline">
            <PhoneOff className="h-4 w-4" />
            Выйти
          </Button>
        </div>

        <div className="playsay-classroom-room min-h-0 flex-1">
          <LiveKitRoom
            audio
            connect
            data-lk-theme="default"
            serverUrl={session.serverUrl}
            token={session.token}
            video
          >
            <ClassroomVideoStage mode={videoOnly ? "videoOnly" : "lesson"} />
          </LiveKitRoom>
        </div>
      </section>

      {videoOnly ? null : (
        <LessonWorkspace
          displayName={displayName}
          materials={materials}
          onAssignMaterial={onAssignMaterial}
          profile={profile}
          session={session}
        />
      )}
    </div>
  );
}

function ClassroomVideoStage({ mode }: { mode: ClassroomVideoMode }) {
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const focusRef = useRef<HTMLDivElement | null>(null);
  const singlePipInitializedRef = useRef(false);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ offsetX: number; offsetY: number; pointerId: number } | null>(null);
  const [pipPosition, setPipPosition] = useState({ x: 12, y: 120 });
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const screenShareTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  );
  const orderedCameraTracks = [...cameraTracks].sort((left, right) => Number(left.participant.isLocal) - Number(right.participant.isLocal));
  const remoteScreenShareTrack = screenShareTracks.find((trackRef) => !trackRef.participant.isLocal);
  const featuredTrack = remoteScreenShareTrack ?? orderedCameraTracks[0];
  const stripTracks = remoteScreenShareTrack ? orderedCameraTracks : orderedCameraTracks.slice(1);
  const hasStrip = stripTracks.length > 0;
  const stripLayout = stripTracks.length > 1 ? "row" : "single";
  const canDragStrip = hasStrip && stripLayout === "single";
  const pipStyle = {
    "--playsay-pip-x": `${pipPosition.x}px`,
    "--playsay-pip-y": `${pipPosition.y}px`,
  } as CSSProperties;

  function clampPipPosition(x: number, y: number) {
    const focusRect = focusRef.current?.getBoundingClientRect();
    const stripRect = stripRef.current?.getBoundingClientRect();

    if (!focusRect || !stripRect) {
      return { x, y };
    }

    const inset = 8;
    const maxX = Math.max(inset, focusRect.width - stripRect.width - inset);
    let maxY = Math.max(inset, focusRect.height - stripRect.height - inset);
    const controlsRect = controlsRef.current?.getBoundingClientRect();

    if (controlsRect && controlsRect.top < focusRect.bottom && controlsRect.bottom > focusRect.top) {
      maxY = Math.min(maxY, Math.max(inset, controlsRect.top - focusRect.top - stripRect.height - inset));
    }

    return {
      x: Math.min(Math.max(x, inset), maxX),
      y: Math.min(Math.max(y, inset), maxY),
    };
  }

  function getDefaultSinglePipPosition() {
    const focusRect = focusRef.current?.getBoundingClientRect();
    const stripRect = stripRef.current?.getBoundingClientRect();
    const inset = 22;

    if (!focusRect || !stripRect) {
      return pipPosition;
    }

    const isCompactVideo = focusRect.width <= 640;
    const xInset = isCompactVideo ? 58 : inset;
    const yInset = isCompactVideo ? 48 : inset;

    return clampPipPosition(xInset, focusRect.height - stripRect.height - yInset);
  }

  function getPipPositionFromPointer(event: PointerEvent<HTMLDivElement>) {
    const focusRect = focusRef.current?.getBoundingClientRect();
    const currentDrag = dragState.current;

    if (!focusRect || !currentDrag) {
      return pipPosition;
    }

    return clampPipPosition(
      event.clientX - focusRect.left - currentDrag.offsetX,
      event.clientY - focusRect.top - currentDrag.offsetY,
    );
  }

  function handlePipPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!canDragStrip || !stripRef.current) {
      return;
    }

    const stripRect = stripRef.current.getBoundingClientRect();
    dragState.current = {
      offsetX: event.clientX - stripRect.left,
      offsetY: event.clientY - stripRect.top,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    setPipPosition(getPipPositionFromPointer(event));
  }

  function handlePipPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragState.current?.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    setPipPosition(getPipPositionFromPointer(event));
  }

  function handlePipPointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (dragState.current?.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragState.current = null;
  }

  useEffect(() => {
    if (mode === "videoOnly") {
      singlePipInitializedRef.current = false;
      return undefined;
    }

    if (!hasStrip) {
      singlePipInitializedRef.current = false;
      return undefined;
    }

    if (stripLayout === "row") {
      dragState.current = null;
      singlePipInitializedRef.current = false;
      return undefined;
    }

    function keepPipInBounds() {
      setPipPosition((current) => {
        const next = singlePipInitializedRef.current ? current : getDefaultSinglePipPosition();
        singlePipInitializedRef.current = true;
        return clampPipPosition(next.x, next.y);
      });
    }

    const animationFrame = window.requestAnimationFrame(keepPipInBounds);
    window.addEventListener("resize", keepPipInBounds);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", keepPipInBounds);
    };
  }, [hasStrip, mode, stripLayout, stripTracks.length]);

  if (mode === "videoOnly" && !remoteScreenShareTrack) {
    return (
      <div className="playsay-classroom-conference" data-layout="grid" data-mode="video-only">
        <div className="playsay-video-grid" data-count={orderedCameraTracks.length || 1}>
          {orderedCameraTracks.length > 0
            ? orderedCameraTracks.map((trackRef) => (
              <ClassroomGridVideoTile key={classroomTrackKey(trackRef)} trackRef={trackRef} />
            ))
            : (
              <div className="playsay-video-grid-empty">
                <Video className="h-6 w-6" />
                <span>Участники появятся здесь</span>
              </div>
            )}
        </div>
        <ClassroomControlBar setControlsRef={(node) => { controlsRef.current = node; }} />
        <RoomAudioRenderer />
        <ConnectionStateToast />
      </div>
    );
  }

  return (
    <div className="playsay-classroom-conference" data-layout={stripLayout} data-screen-share={remoteScreenShareTrack ? "true" : "false"}>
      <div className="playsay-video-focus" ref={focusRef}>
        {featuredTrack ? <ParticipantTile trackRef={featuredTrack} /> : null}
        {remoteScreenShareTrack ? (
          <div className="playsay-screen-share-label">
            <ScreenShare className="h-4 w-4" />
            {participantDisplayName(remoteScreenShareTrack)}
          </div>
        ) : null}
        <div
          className="playsay-video-strip"
          data-draggable={canDragStrip ? "true" : "false"}
          data-empty={hasStrip ? "false" : "true"}
          data-layout={stripLayout}
          onPointerCancel={handlePipPointerEnd}
          onPointerDown={handlePipPointerDown}
          onPointerMove={handlePipPointerMove}
          onPointerUp={handlePipPointerEnd}
          ref={stripRef}
          style={pipStyle}
        >
          {hasStrip
            ? stripTracks.map((trackRef) => (
              <ClassroomMiniVideoTile
                key={classroomTrackKey(trackRef)}
                layout={stripLayout}
                trackRef={trackRef}
              />
            ))
            : null}
        </div>
      </div>
      <ClassroomControlBar setControlsRef={(node) => { controlsRef.current = node; }} />
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </div>
  );
}

function ClassroomControlBar({ setControlsRef }: { setControlsRef: (node: HTMLDivElement | null) => void }) {
  return (
    <div className="lk-control-bar playsay-classroom-controls" ref={setControlsRef}>
      <TrackToggle source={Track.Source.Microphone}>Микрофон</TrackToggle>
      <TrackToggle source={Track.Source.Camera}>Камера</TrackToggle>
      <TrackToggle source={Track.Source.ScreenShare}>
        <ScreenShare className="h-4 w-4" />
        Экран
      </TrackToggle>
      <StartMediaButton label="Включить медиа" />
    </div>
  );
}

function ClassroomGridVideoTile({ trackRef }: { trackRef: ClassroomTrackReference }) {
  const label = participantDisplayName(trackRef);

  return (
    <div className="playsay-video-grid-card">
      <ParticipantTile trackRef={trackRef} />
      <div className="playsay-video-card-label" title={label}>
        {label}
      </div>
    </div>
  );
}

function ClassroomMiniVideoTile({
  layout,
  trackRef,
}: {
  layout: ClassroomStripLayout;
  trackRef: ClassroomTrackReference;
}) {
  const label = participantDisplayName(trackRef);

  return (
    <div className="playsay-video-card" data-layout={layout}>
      <ParticipantTile trackRef={trackRef} />
      <div className="playsay-video-card-label" title={label}>
        {label}
      </div>
    </div>
  );
}

function LessonWorkspace({
  displayName,
  materials,
  onAssignMaterial,
  profile,
  session,
}: {
  displayName: string;
  materials: LessonMaterial[];
  onAssignMaterial: (lessonId: string, materialId: string | null) => Promise<ScheduledLesson | null>;
  profile: MeProfile | null;
  session: LessonRoomSession;
}) {
  const [material, setMaterial] = useState<LessonMaterial | null>(null);
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState(session.materialId ?? "");
  const [assigningMaterial, setAssigningMaterial] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);
  const [submission, setSubmission] = useState<LessonMaterialSubmission | null>(null);
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const [submissionSaving, setSubmissionSaving] = useState(false);
  const [submissionSnapshots, setSubmissionSnapshots] = useState<LessonMaterialSubmission[]>([]);
  const [submissionMonitorError, setSubmissionMonitorError] = useState<string | null>(null);
  const canMonitorSubmissions = canAssignLessons(profile);
  const canManageMaterial = canAssignLessons(profile);
  const selectableMaterials = materials.filter((item) => item.status !== "ARCHIVED");
  const lessonScore = canMonitorSubmissions ? averageSubmissionScore(submissionSnapshots) : submission?.score ?? null;

  useEffect(() => {
    setSelectedMaterialId(session.materialId ?? "");
  }, [session.materialId]);

  useEffect(() => {
    if (assignmentMessage !== "Материал назначен" && assignmentMessage !== "Материал снят") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setAssignmentMessage(null), 2_500);
    return () => window.clearTimeout(timeoutId);
  }, [assignmentMessage]);

  useEffect(() => {
    if (!session.materialId) {
      setMaterial(null);
      setMaterialError(null);
      setMaterialLoading(false);
      return undefined;
    }

    let cancelled = false;

    async function loadMaterial() {
      setMaterialLoading(true);
      setMaterialError(null);
      try {
        const lessonMaterial = await fetchScheduledLessonMaterial(session.lessonId);
        if (!cancelled) {
          setMaterial(lessonMaterial);
        }
      } catch (caught) {
        if (!cancelled) {
          setMaterial(null);
          setMaterialError(caught instanceof Error ? caught.message : "Не удалось загрузить материал");
        }
      } finally {
        if (!cancelled) {
          setMaterialLoading(false);
        }
      }
    }

    void loadMaterial();
    return () => {
      cancelled = true;
    };
  }, [session.lessonId, session.materialId]);

  useEffect(() => {
    if (!session.materialId) {
      setSubmission(null);
      setSubmissionMessage(null);
      return undefined;
    }

    let cancelled = false;

    async function loadSubmission() {
      try {
        const savedSubmission = await fetchScheduledLessonMaterialSubmission(session.lessonId);
        if (!cancelled) {
          setSubmission(savedSubmission);
        }
      } catch (caught) {
        if (!cancelled) {
          setSubmission(null);
          setSubmissionMessage(caught instanceof Error ? caught.message : "Не удалось загрузить ответы");
        }
      }
    }

    void loadSubmission();
    return () => {
      cancelled = true;
    };
  }, [session.lessonId, session.materialId]);

  useEffect(() => {
    if (!canMonitorSubmissions || !material?.id) {
      setSubmissionSnapshots([]);
      setSubmissionMonitorError(null);
      return undefined;
    }

    let cancelled = false;

    async function loadSubmissionSnapshots() {
      try {
        const snapshots = await fetchScheduledLessonMaterialSubmissions(session.lessonId);
        if (!cancelled) {
          setSubmissionSnapshots(snapshots);
          setSubmissionMonitorError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setSubmissionSnapshots([]);
          setSubmissionMonitorError(caught instanceof Error ? caught.message : "Не удалось загрузить ответы учеников");
        }
      }
    }

    void loadSubmissionSnapshots();
    const intervalId = window.setInterval(() => {
      void loadSubmissionSnapshots();
    }, 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [canMonitorSubmissions, material?.id, session.lessonId]);

  async function saveMaterialAnswers(content: LessonMaterialJson) {
    setSubmissionSaving(true);
    setSubmissionMessage(null);
    try {
      const savedSubmission = await saveScheduledLessonMaterialSubmission(session.lessonId, {
        content,
        submitted: true,
      });
      setSubmission(savedSubmission);
      setSubmissionMessage("Ответ отправлен");
    } catch (caught) {
      setSubmissionMessage(caught instanceof Error ? caught.message : "Не удалось отправить ответ");
    } finally {
      setSubmissionSaving(false);
    }
  }

  async function assignMaterial() {
    setAssigningMaterial(true);
    setAssignmentMessage(null);
    try {
      const updated = await onAssignMaterial(session.lessonId, selectedMaterialId || null);
      if (!updated) {
        setAssignmentMessage("Материал не назначен");
        return;
      }

      if (!updated.materialId) {
        setMaterial(null);
        setMaterialError(null);
        setAssignmentMessage("Материал снят");
        return;
      }

      const lessonMaterial = await fetchScheduledLessonMaterial(session.lessonId);
      setMaterial(lessonMaterial);
      setMaterialError(null);
      setAssignmentMessage("Материал назначен");
    } catch (caught) {
      setAssignmentMessage(caught instanceof Error ? caught.message : "Не удалось назначить материал");
    } finally {
      setAssigningMaterial(false);
    }
  }

  return (
    <section className="playsay-workbench">
      <header className="playsay-workbench-topbar">
        <nav className="playsay-lesson-tabs" aria-label="Разделы урока">
          <button className="playsay-lesson-tab" data-active="true" type="button">
            Урок
          </button>
        </nav>

        <div className="playsay-workbench-tools">
          {canManageMaterial ? (
            <div className="playsay-lesson-material-picker">
              <select
                className="playsay-input"
                disabled={assigningMaterial || selectableMaterials.length === 0}
                onChange={(event) => setSelectedMaterialId(event.target.value)}
                value={selectedMaterialId}
              >
                <option value="">Материал не выбран</option>
                {selectableMaterials.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
              <Button
                disabled={assigningMaterial || selectedMaterialId === (session.materialId ?? "")}
                onClick={() => void assignMaterial()}
                type="button"
                variant="outline"
              >
                {assigningMaterial ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Назначить
              </Button>
            </div>
          ) : null}
          <div className="playsay-lesson-statusline">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-4 w-4 text-primary" />
              {formatLessonRange(session.lessonStartsAt, session.lessonEndsAt)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4 text-primary" />
              {formatParticipantCount(session.participants.length)}
            </span>
          </div>
        </div>
      </header>

      <div className="playsay-workbench-body">

        {assignmentMessage ? (
          <div className="playsay-lesson-inline-message">
            {assignmentMessage}
          </div>
        ) : null}

        {material ? (
          <div className="playsay-assignment-strip" aria-label="Назначенные задания">
            {materialDocumentBlocks(material).slice(0, 6).map((block, index) => (
              <AssignmentStub
                active={index === 0}
                key={block.id}
                tag={materialBlockLabel(block.type)}
                title={block.title}
              />
            ))}
          </div>
        ) : (
          <div className="playsay-assignment-strip" aria-label="Назначенные задания">
            <AssignmentStub active title="Материал не назначен" tag="Урок" />
          </div>
        )}

        {canMonitorSubmissions && material ? (
          <MaterialSubmissionsMonitor error={submissionMonitorError} submissions={submissionSnapshots} />
        ) : null}

        {materialLoading ? (
          <div className="playsay-task-board playsay-material-loading">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>Материал загружается</span>
          </div>
        ) : material ? (
          <LessonTaskCanvas
            lessonId={session.lessonId}
            material={material}
            onSaveAnswers={(content) => void saveMaterialAnswers(content)}
            score={lessonScore}
            submission={submission}
            submissionMessage={submissionMessage}
            submissionSaving={submissionSaving}
            teacherName={session.teacherName ?? displayName}
          />
        ) : canManageMaterial ? (
          <div className="playsay-task-board playsay-material-loading">
            <BookOpen className="h-5 w-5 text-primary" />
            <span>Выберите материал для урока</span>
          </div>
        ) : (
          <>
            {materialError ? (
              <div className="mb-2 rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
                {materialError}
              </div>
            ) : null}
            <LessonTaskCanvas
              lessonId={session.lessonId}
              onSaveAnswers={(content) => void saveMaterialAnswers(content)}
              score={lessonScore}
              submission={submission}
              submissionMessage={submissionMessage}
              submissionSaving={submissionSaving}
              teacherName={session.teacherName ?? displayName}
            />
          </>
        )}
      </div>
    </section>
  );
}

function MaterialSubmissionsMonitor({
  error,
  submissions,
}: {
  error: string | null;
  submissions: LessonMaterialSubmission[];
}) {
  const latestSubmissions = submissions.slice(0, 4);

  return (
    <section className="playsay-submission-monitor" aria-label="Ответы учеников">
      <div className="playsay-submission-monitor-summary">
        <span>Ответы учеников</span>
        <strong>{submissions.length}</strong>
      </div>
      <div className="playsay-submission-monitor-list">
        {error ? (
          <span className="playsay-submission-monitor-error">
            <AlertCircle className="h-3.5 w-3.5" />
            Ошибка загрузки
          </span>
        ) : latestSubmissions.length === 0 ? (
          <span className="playsay-submission-monitor-empty">пока нет ответов</span>
        ) : (
          latestSubmissions.map((submission) => {
            const assessment = materialSubmissionAssessmentSummary(submission);
            return (
              <span className="playsay-submission-pill" key={submission.id} title={`${materialSubmissionUserLabel(submission)} · ${assessment.label}`}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{materialSubmissionUserLabel(submission)}</span>
                {typeof submission.score === "number" ? <strong>{formatMaterialScore(submission.score)}</strong> : null}
                {assessment.hints > 0 ? <small>{assessment.hints} hint</small> : null}
                {assessment.retries > 0 ? <small>{assessment.retries} retry</small> : null}
                <time dateTime={submission.submittedAt ?? submission.updatedAt}>
                  {formatSubmissionTime(submission.submittedAt ?? submission.updatedAt)}
                </time>
              </span>
            );
          })
        )}
      </div>
    </section>
  );
}

function LessonTaskCanvas({
  lessonId,
  material,
  onSaveAnswers,
  score,
  submission,
  submissionMessage,
  submissionSaving,
  teacherName,
}: {
  lessonId: string;
  material?: LessonMaterial | null;
  onSaveAnswers: (content: LessonMaterialJson) => void;
  score: number | null;
  submission: LessonMaterialSubmission | null;
  submissionMessage: string | null;
  submissionSaving: boolean;
  teacherName: string;
}) {
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>("pointer");
  const [annotationColor, setAnnotationColor] = useState("#ff5c00");
  const [annotationStrokes, setAnnotationStrokes] = useState<AnnotationStroke[]>([]);
  const [annotationReady, setAnnotationReady] = useState(false);
  const [answers, setAnswers] = useState<MaterialAnswerState>({});
  const activeStrokeId = useRef<string | null>(null);
  const lastSyncedAnnotationRef = useRef("");

  useEffect(() => {
    setAnswers(materialAnswersFromSubmission(submission));
  }, [material?.id, submission?.id, submission?.updatedAt]);

  useEffect(() => {
    const materialId = material?.id;
    if (!materialId) {
      setAnnotationReady(false);
      setAnnotationStrokes([]);
      lastSyncedAnnotationRef.current = "";
      return undefined;
    }

    let cancelled = false;

    async function loadAnnotation() {
      try {
        const annotation = await fetchScheduledLessonMaterialAnnotation(lessonId);
        const content = annotationContentFromJson(annotation?.content);
        const serialized = JSON.stringify(content);
        if (!cancelled && serialized !== lastSyncedAnnotationRef.current) {
          lastSyncedAnnotationRef.current = serialized;
          setAnnotationStrokes(content.strokes);
        }
      } catch {
        const content = emptyAnnotationContent();
        const serialized = JSON.stringify(content);
        if (!cancelled && serialized !== lastSyncedAnnotationRef.current) {
          lastSyncedAnnotationRef.current = serialized;
          setAnnotationStrokes(content.strokes);
        }
      } finally {
        if (!cancelled) {
          setAnnotationReady(true);
        }
      }
    }

    setAnnotationReady(false);
    lastSyncedAnnotationRef.current = "";
    setAnnotationStrokes([]);
    void loadAnnotation();
    const intervalId = window.setInterval(() => {
      void loadAnnotation();
    }, 2_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [lessonId, material?.id]);

  useEffect(() => {
    if (!material?.id || !annotationReady) {
      return undefined;
    }

    const content = annotationContentFromStrokes(annotationStrokes);
    const serialized = JSON.stringify(content);
    if (serialized === lastSyncedAnnotationRef.current) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      saveScheduledLessonMaterialAnnotation(lessonId, { content })
        .then(() => {
          lastSyncedAnnotationRef.current = serialized;
        })
        .catch(() => {
          // The next local edit or polling cycle will retry without blocking the lesson UI.
        });
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [annotationReady, annotationStrokes, lessonId, material?.id]);

  function updateAnswer(blockId: string, answer: MaterialAnswerBlock) {
    setAnswers((current) => ({
      ...current,
      [blockId]: answer,
    }));
  }

  function submitAnswers() {
    if (!material) {
      return;
    }
    onSaveAnswers({
      schemaVersion: 1,
      materialId: material.id,
      answers,
    });
  }

  const savedAnswersKey = JSON.stringify(materialAnswersFromSubmission(submission));
  const answersKey = JSON.stringify(answers);
  const liveScore = material ? materialLiveScore(material, answers) : null;
  const displayScore = answersKey !== savedAnswersKey && liveScore !== null
    ? liveScore
    : score ?? liveScore;

  function beginAnnotation(event: PointerEvent<SVGSVGElement>) {
    if (annotationTool === "pointer") {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = svgPointFromEvent(event);
    if (annotationTool === "eraser") {
      eraseAnnotationAt(point, setAnnotationStrokes);
      return;
    }

    const id = `stroke-${Date.now()}-${Math.round(point.x)}-${Math.round(point.y)}`;
    activeStrokeId.current = id;
    setAnnotationStrokes((current) => [...current, { color: annotationColor, id, points: [point] }]);
  }

  function extendAnnotation(event: PointerEvent<SVGSVGElement>) {
    if (annotationTool === "pointer") {
      return;
    }

    event.preventDefault();
    const point = svgPointFromEvent(event);
    if (annotationTool === "eraser") {
      eraseAnnotationAt(point, setAnnotationStrokes);
      return;
    }

    const id = activeStrokeId.current;
    if (!id) {
      return;
    }

    setAnnotationStrokes((current) =>
      current.map((stroke) => (stroke.id === id ? { ...stroke, points: [...stroke.points, point] } : stroke)),
    );
  }

  function endAnnotation(event: PointerEvent<SVGSVGElement>) {
    if (activeStrokeId.current) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be gone after browser-level cancellation.
      }
    }
    activeStrokeId.current = null;
  }

  return (
    <div className="playsay-task-board">
      <aside className="playsay-annotation-toolbar" aria-label="Инструменты задания">
        <AnnotationToolButton active={annotationTool === "pointer"} label="Курсор" onClick={() => setAnnotationTool("pointer")}>
          <MousePointer2 className="h-4 w-4" />
        </AnnotationToolButton>
        <AnnotationToolButton active={annotationTool === "pen"} label="Карандаш" onClick={() => setAnnotationTool("pen")}>
          <PenLine className="h-4 w-4" />
        </AnnotationToolButton>
        <AnnotationToolButton active={annotationTool === "eraser"} label="Ластик" onClick={() => setAnnotationTool("eraser")}>
          <Eraser className="h-4 w-4" />
        </AnnotationToolButton>
        <AnnotationToolButton
          active={false}
          disabled={annotationStrokes.length === 0}
          label="Отменить"
          onClick={() => setAnnotationStrokes((current) => current.slice(0, -1))}
        >
          <Undo2 className="h-4 w-4" />
        </AnnotationToolButton>
        <div className="playsay-color-swatches" aria-label="Цвет">
          {["#ff5c00", "#00a878", "#2574ff"].map((color) => (
            <button
              aria-label={color}
              className="playsay-color-swatch"
              data-active={annotationColor === color ? "true" : "false"}
              key={color}
              onClick={() => setAnnotationColor(color)}
              style={{ backgroundColor: color }}
              type="button"
            />
          ))}
        </div>
      </aside>

      <div className="playsay-task-page">
        <div className="playsay-task-document">
          {material ? (
            <LessonMaterialDocumentView
              answers={answers}
              material={material}
              mode="classroom"
              onAnswerChange={updateAnswer}
              score={displayScore}
            />
          ) : (
            <FallbackLessonDocument />
          )}
        </div>

        <svg
          className="playsay-annotation-layer"
          data-tool={annotationTool}
          onPointerCancel={endAnnotation}
          onPointerDown={beginAnnotation}
          onPointerMove={extendAnnotation}
          onPointerUp={endAnnotation}
          viewBox="0 0 1000 700"
        >
          {annotationStrokes.map((stroke) => (
            <path
              d={pointsToSvgPath(stroke.points)}
              fill="none"
              key={stroke.id}
              stroke={stroke.color}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="8"
            />
          ))}
        </svg>
      </div>

      <footer className="playsay-task-footer">
        <button aria-label="Предыдущее задание" className="playsay-page-button" type="button">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span>1 из 14</span>
        <button aria-label="Следующее задание" className="playsay-page-button" type="button">
          <ChevronRight className="h-4 w-4" />
        </button>
        <Button disabled={!material || submissionSaving} onClick={submitAnswers} type="button">
          {submissionSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {submissionSaving ? "Отправляем" : "Отправить"}
        </Button>
        {submissionMessage ? <span className="playsay-task-submit-status">{submissionMessage}</span> : null}
        <span className="playsay-task-teacher">{teacherName}</span>
      </footer>
    </div>
  );
}

function svgPointFromEvent(event: PointerEvent<SVGSVGElement>): AnnotationPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 1000,
    y: ((event.clientY - rect.top) / rect.height) * 700,
  };
}

function eraseAnnotationAt(
  point: AnnotationPoint,
  setStrokes: (updater: (current: AnnotationStroke[]) => AnnotationStroke[]) => void,
) {
  setStrokes((current) => current.filter((stroke) => distanceToStroke(point, stroke) > 34));
}

function emptyAnnotationContent(): { schemaVersion: 1; strokes: AnnotationStroke[] } {
  return { schemaVersion: 1, strokes: [] };
}

function annotationContentFromStrokes(strokes: AnnotationStroke[]): LessonMaterialJson {
  return {
    schemaVersion: 1,
    strokes: strokes.map((stroke) => ({
      color: stroke.color,
      id: stroke.id,
      points: stroke.points.map((point) => ({
        x: Number(point.x.toFixed(1)),
        y: Number(point.y.toFixed(1)),
      })),
    })),
  };
}

function asJsonObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function annotationContentFromJson(value: unknown): { schemaVersion: 1; strokes: AnnotationStroke[] } {
  const root = asJsonObject(value);
  const strokes = Array.isArray(root.strokes)
    ? root.strokes
        .map((stroke) => annotationStrokeFromJson(stroke))
        .filter((stroke): stroke is AnnotationStroke => stroke !== null)
    : [];

  return { schemaVersion: 1, strokes };
}

function annotationStrokeFromJson(value: unknown): AnnotationStroke | null {
  const stroke = asJsonObject(value);
  const id = asString(stroke.id).trim();
  const color = asString(stroke.color).trim() || "#ff5c00";
  const rawPoints = Array.isArray(stroke.points) ? stroke.points : [];
  const points = rawPoints
    .map((point) => {
      const pointObject = asJsonObject(point);
      const x = asNumber(pointObject.x);
      const y = asNumber(pointObject.y);
      return x === null || y === null ? null : { x, y };
    })
    .filter((point): point is AnnotationPoint => point !== null);

  if (!id || points.length === 0) {
    return null;
  }

  return { color, id, points };
}

function distanceToStroke(point: AnnotationPoint, stroke: AnnotationStroke): number {
  return stroke.points.reduce((nearest, strokePoint) => {
    const distance = Math.hypot(point.x - strokePoint.x, point.y - strokePoint.y);
    return Math.min(nearest, distance);
  }, Number.POSITIVE_INFINITY);
}

function pointsToSvgPath(points: AnnotationPoint[]): string {
  if (points.length === 0) {
    return "";
  }

  const [firstPoint, ...rest] = points;
  return rest.reduce(
    (path, point) => `${path} L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
    `M ${firstPoint.x.toFixed(1)} ${firstPoint.y.toFixed(1)}`,
  );
}

function participantDisplayName(trackRef: ClassroomTrackReference): string {
  return (
    trackRef.participant.name?.trim()
    || trackRef.participant.identity?.trim()
    || "Участник"
  );
}

function classroomTrackKey(trackRef: ClassroomTrackReference): string {
  return `${trackRef.participant.sid || trackRef.participant.identity}-${trackRef.source ?? "camera"}`;
}
