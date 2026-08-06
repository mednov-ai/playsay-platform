import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ConnectionStateToast, ParticipantTile, RoomAudioRenderer, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { ScreenShare, UserRound, Video } from "lucide-react";
import { ClassroomControlBar } from "./ClassroomControlBar";
import { useAppTranslation } from "../../../shared/i18n";
import { useLessonTranslation } from "../hooks/useLessonTranslation";
import type { TranslationRole } from "../model/realtimeTranslation";
import type { LessonParticipantPresenceMap, LessonParticipantPresenceState } from "../model/session";
import type { ScheduledLesson } from "../../../shared/api/playsay";
import { externalActivityTrackPrefix } from "../model/externalActivityProtocol";

type ClassroomTrackReference = ReturnType<typeof useTracks>[number];
type ExpectedParticipant = ScheduledLesson["participants"][number];
export type ClassroomVideoSlot =
  | { kind: "track"; trackRef: ClassroomTrackReference }
  | {
      kind: "placeholder";
      displayName: string;
      state: LessonParticipantPresenceState;
      subject: string;
    };
type ClassroomStripLayout = "single" | "row";
export type ClassroomVideoMode = "lesson" | "videoOnly" | "focusOnly" | "externalActivity";

export function ClassroomVideoStage({
  expectedParticipants,
  lessonId,
  lessonType,
  mode,
  canCompleteLesson,
  fullscreenActive,
  fullscreenLabel,
  fullscreenPending,
  onComplete,
  onLeave,
  onScreenShareActiveChange,
  onToggleFullscreen,
  participantPresence,
  showExpectedParticipants,
  translationAllowed,
  translationRole,
}: {
  expectedParticipants: ScheduledLesson["participants"];
  lessonId: string;
  lessonType: string;
  mode: ClassroomVideoMode;
  canCompleteLesson: boolean;
  fullscreenActive: boolean;
  fullscreenLabel: string;
  fullscreenPending: boolean;
  onComplete: () => void;
  onLeave: () => void;
  onScreenShareActiveChange: (active: boolean) => void;
  onToggleFullscreen: () => void;
  participantPresence: LessonParticipantPresenceMap;
  showExpectedParticipants: boolean;
  translationAllowed: boolean;
  translationRole: TranslationRole | null;
}) {
  const { t } = useAppTranslation();
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const focusRef = useRef<HTMLDivElement | null>(null);
  const singlePipInitializedRef = useRef(false);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ offsetX: number; offsetY: number; pointerId: number } | null>(null);
  const [pipPosition, setPipPosition] = useState({ x: 12, y: 120 });
  const translation = useLessonTranslation({ allowed: translationAllowed, lessonId, lessonType, role: translationRole });
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const screenShareTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  );
  const cameraSlots = classroomCameraSlots(
    cameraTracks,
    expectedParticipants,
    participantPresence,
    showExpectedParticipants,
  );
  const activeScreenShareTrack = classroomScreenShareTrack(screenShareTracks);
  const screenShareActive = Boolean(activeScreenShareTrack);
  const featuredSlot = cameraSlots[0];
  const stripSlots = activeScreenShareTrack ? cameraSlots : cameraSlots.slice(1);
  const externalActivityVideo = classroomExternalActivityVideo(cameraSlots);
  const hasStrip = stripSlots.length > 0;
  const stripLayout = stripSlots.length > 1 ? "row" : "single";
  const canDragStrip = mode === "externalActivity"
    ? Boolean(externalActivityVideo.featuredSlot)
    : hasStrip && stripLayout === "single";
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
    const minY = mode === "externalActivity"
      ? Math.min(112, Math.max(inset, focusRect.height - stripRect.height - inset))
      : inset;
    const maxX = Math.max(inset, focusRect.width - stripRect.width - inset);
    let maxY = Math.max(minY, focusRect.height - stripRect.height - inset);
    const controlsRect = controlsRef.current?.getBoundingClientRect();

    if (controlsRect && controlsRect.top < focusRect.bottom && controlsRect.bottom > focusRect.top) {
      maxY = Math.max(minY, Math.min(maxY, controlsRect.top - focusRect.top - stripRect.height - inset));
    }

    return {
      x: Math.min(Math.max(x, inset), maxX),
      y: Math.min(Math.max(y, minY), maxY),
    };
  }

  function getDefaultSinglePipPosition() {
    const focusRect = focusRef.current?.getBoundingClientRect();
    const stripRect = stripRef.current?.getBoundingClientRect();
    const inset = 22;

    if (!focusRect || !stripRect) {
      return pipPosition;
    }

    if (mode === "externalActivity") {
      return clampPipPosition(focusRect.width, focusRect.height);
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
    onScreenShareActiveChange(screenShareActive);

    return () => {
      if (screenShareActive) {
        onScreenShareActiveChange(false);
      }
    };
  }, [onScreenShareActiveChange, screenShareActive]);

  useEffect(() => {
    if (mode === "videoOnly") {
      singlePipInitializedRef.current = false;
      return undefined;
    }

    if (!canDragStrip) {
      dragState.current = null;
      singlePipInitializedRef.current = false;
      return undefined;
    }

    if (mode !== "externalActivity" && stripLayout === "row") {
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
  }, [canDragStrip, externalActivityVideo.additionalCount, mode, stripLayout, stripSlots.length]);

  if (mode === "externalActivity") {
    return (
      <div className="playsay-classroom-conference" data-layout="pip" data-mode="external-activity">
        <div className="playsay-external-activity-video-overlay" ref={focusRef}>
          {externalActivityVideo.featuredSlot ? (
            <div
              className="playsay-external-activity-pip"
              data-draggable="true"
              onPointerCancel={handlePipPointerEnd}
              onPointerDown={handlePipPointerDown}
              onPointerMove={handlePipPointerMove}
              onPointerUp={handlePipPointerEnd}
              ref={stripRef}
              style={pipStyle}
            >
              <ClassroomMiniVideoTile layout="single" slot={externalActivityVideo.featuredSlot} />
              {externalActivityVideo.additionalCount > 0 ? (
                <span className="playsay-external-activity-participant-count">
                  +{externalActivityVideo.additionalCount}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <ClassroomControlBar
          externalActivityFocus
          onLeave={onLeave}
          role={translationRole}
          setControlsRef={(node) => { controlsRef.current = node; }}
          translation={translation}
        />
        <RoomAudioRenderer />
        <ConnectionStateToast />
      </div>
    );
  }

  if (mode === "videoOnly" && !activeScreenShareTrack) {
    return (
      <div className="playsay-classroom-conference" data-layout="grid" data-mode="video-only">
        <div className="playsay-video-grid" data-count={cameraSlots.length || 1}>
          {cameraSlots.length > 0
            ? cameraSlots.map((slot) => (
              <ClassroomGridVideoSlot key={classroomSlotKey(slot)} slot={slot} />
            ))
            : (
              <div className="playsay-video-grid-empty">
                <Video className="h-6 w-6" />
                <span>{t("classroom.video.emptyParticipants")}</span>
              </div>
            )}
        </div>
        <ClassroomTranslationOverlay translation={translation} />
        <ClassroomControlBar
          canCompleteLesson={canCompleteLesson}
          fullscreenActive={fullscreenActive}
          fullscreenLabel={fullscreenLabel}
          fullscreenPending={fullscreenPending}
          onComplete={onComplete}
          onLeave={onLeave}
          onToggleFullscreen={onToggleFullscreen}
          role={translationRole}
          setControlsRef={(node) => { controlsRef.current = node; }}
          translation={translation}
        />
        <RoomAudioRenderer />
        <ConnectionStateToast />
      </div>
    );
  }

  return (
    <div
      className="playsay-classroom-conference"
      data-layout={stripLayout}
      data-mode={mode === "focusOnly" ? "focus-only" : "lesson"}
      data-screen-share={activeScreenShareTrack ? "true" : "false"}
    >
      <div className="playsay-video-focus" ref={focusRef}>
        {activeScreenShareTrack ? <ParticipantTile trackRef={activeScreenShareTrack} /> : featuredSlot ? <ClassroomVideoSlotView slot={featuredSlot} /> : null}
        {activeScreenShareTrack ? (
          <div className="playsay-screen-share-label">
            <ScreenShare className="h-4 w-4" />
            {participantDisplayName(activeScreenShareTrack, t("classroom.participantFallback"))}
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
            ? stripSlots.map((slot) => (
              <ClassroomMiniVideoTile
                key={classroomSlotKey(slot)}
                layout={stripLayout}
                slot={slot}
              />
            ))
            : null}
        </div>
      </div>
      <ClassroomTranslationOverlay translation={translation} />
      <ClassroomControlBar
        canCompleteLesson={canCompleteLesson}
        fullscreenActive={fullscreenActive}
        fullscreenLabel={fullscreenLabel}
        fullscreenPending={fullscreenPending}
        onComplete={onComplete}
        onLeave={onLeave}
        onToggleFullscreen={onToggleFullscreen}
        role={translationRole}
        setControlsRef={(node) => { controlsRef.current = node; }}
        translation={translation}
      />
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </div>
  );
}

export function classroomScreenShareTrack(screenShareTracks: ClassroomTrackReference[]) {
  const presentationTracks = screenShareTracks.filter((trackRef) => !trackRef.publication?.trackName?.startsWith(externalActivityTrackPrefix));
  return presentationTracks.find((trackRef) => !trackRef.participant.isLocal) ?? presentationTracks[0];
}

export function classroomExternalActivityVideo(cameraSlots: ClassroomVideoSlot[]) {
  const remoteSlots = cameraSlots.filter((slot) => (
    slot.kind === "placeholder" || !slot.trackRef.participant.isLocal
  ));

  return {
    additionalCount: Math.max(0, remoteSlots.length - 1),
    featuredSlot: remoteSlots[0],
  };
}

function ClassroomTranslationOverlay({ translation }: { translation: ReturnType<typeof useLessonTranslation> }) {
  const { t } = useAppTranslation();
  const latestCaption = [...translation.captions].reverse().find((caption) => caption.text.trim())?.text.trim();
  if (!translation.localEnabled && !translation.canEnable) return null;

  const statusText = translationStatusText(translation, t);
  return (
    <div className="playsay-translation-overlay" data-status={translation.status}>
      <div aria-live="polite" className="playsay-translation-status">{statusText}</div>
      {latestCaption ? <div aria-live="polite" className="playsay-translation-caption">{latestCaption}</div> : null}
      {!translation.localEnabled && translation.canEnable ? (
        <div className="playsay-translation-disclosure">{t("classroom.translation.disclosure")}</div>
      ) : null}
    </div>
  );
}

function translationStatusText(
  translation: ReturnType<typeof useLessonTranslation>,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const knownErrorCodes = new Set([
    "LESSON_TRANSLATION_ACCESS_DENIED",
    "LESSON_TRANSLATION_NOT_INDIVIDUAL",
    "LESSON_TRANSLATION_PARTICIPANTS_INVALID",
    "LESSON_TRANSLATION_LANGUAGE_UNAVAILABLE",
    "LESSON_TRANSLATION_NOT_REQUIRED",
    "LESSON_TRANSLATION_PERMISSION_REQUIRED",
    "LESSON_TRANSLATION_PROVIDER_UNAVAILABLE",
    "LESSON_TRANSLATION_CONNECTION_FAILED",
  ]);
  if (translation.errorCode) {
    const errorCode = knownErrorCodes.has(translation.errorCode)
      ? translation.errorCode
      : "LESSON_TRANSLATION_CONNECTION_FAILED";
    return t(`classroom.translation.errors.${errorCode}`);
  }
  if (!translation.localEnabled) return t("classroom.translation.enableHint");
  if (!translation.remoteEnabled) return t("classroom.translation.waitingPeer");
  if (translation.status === "connecting") return t("classroom.translation.connecting");
  if (translation.status === "starting") return t("classroom.translation.starting");
  if (translation.status === "speaking") return t("classroom.translation.speaking");
  if (translation.status === "receiving") return t("classroom.translation.receiving");
  if (translation.status === "draining") return t("classroom.translation.draining");
  if (translation.status === "ready") return t("classroom.translation.ready");
  return t("classroom.translation.waiting");
}

function ClassroomGridVideoSlot({ slot }: { slot: ClassroomVideoSlot }) {
  const { t } = useAppTranslation();
  const label = slot.kind === "track"
    ? participantDisplayName(slot.trackRef, t("classroom.participantFallback"))
    : slot.displayName;

  return (
    <div className="playsay-video-grid-card">
      <ClassroomVideoSlotView slot={slot} />
      {slot.kind === "track" ? <div className="playsay-video-card-label" title={label}>{label}</div> : null}
    </div>
  );
}

function ClassroomMiniVideoTile({
  layout,
  slot,
}: {
  layout: ClassroomStripLayout;
  slot: ClassroomVideoSlot;
}) {
  const { t } = useAppTranslation();
  const label = slot.kind === "track"
    ? participantDisplayName(slot.trackRef, t("classroom.participantFallback"))
    : slot.displayName;

  return (
    <div className="playsay-video-card" data-layout={layout}>
      <ClassroomVideoSlotView slot={slot} />
      {slot.kind === "track" ? <div className="playsay-video-card-label" title={label}>{label}</div> : null}
    </div>
  );
}

function ClassroomVideoSlotView({ slot }: { slot: ClassroomVideoSlot }) {
  const { t } = useAppTranslation();
  if (slot.kind === "track") return <ParticipantTile trackRef={slot.trackRef} />;
  const statusKey = slot.state === "CHECKING_DEVICES"
    ? "checkingDevices"
    : slot.state === "ONLINE"
      ? "online"
      : "offline";
  return (
    <div aria-live="polite" className="playsay-video-presence" data-presence-state={slot.state}>
      <span className="playsay-video-presence-icon"><UserRound aria-hidden="true" /></span>
      <strong title={slot.displayName}>{slot.displayName}</strong>
      <span>{t(`classroom.presence.${statusKey}`)}</span>
    </div>
  );
}

export function classroomCameraSlots(
  cameraTracks: ClassroomTrackReference[],
  expectedParticipants: ExpectedParticipant[],
  participantPresence: LessonParticipantPresenceMap,
  showExpectedParticipants: boolean,
): ClassroomVideoSlot[] {
  const orderedTracks = [...cameraTracks].sort(
    (left, right) => Number(left.participant.isLocal) - Number(right.participant.isLocal),
  );
  const connectedIdentities = new Set(
    orderedTracks.map((trackRef) => trackRef.participant.identity).filter(Boolean),
  );
  const remoteTracks = orderedTracks.filter((trackRef) => !trackRef.participant.isLocal);
  const localTracks = orderedTracks.filter((trackRef) => trackRef.participant.isLocal);
  const placeholders = showExpectedParticipants
    ? expectedParticipants
      .filter((participant) => !connectedIdentities.has(participant.subject))
      .map<ClassroomVideoSlot>((participant) => ({
        kind: "placeholder",
        displayName: participant.displayName?.trim() || participant.username?.trim() || participant.subject,
        state: participantPresence[participant.subject] ?? "OFFLINE",
        subject: participant.subject,
      }))
    : [];
  return [
    ...remoteTracks.map<ClassroomVideoSlot>((trackRef) => ({ kind: "track", trackRef })),
    ...placeholders,
    ...localTracks.map<ClassroomVideoSlot>((trackRef) => ({ kind: "track", trackRef })),
  ];
}

function participantDisplayName(trackRef: ClassroomTrackReference, fallback: string): string {
  return (
    trackRef.participant.name?.trim()
    || trackRef.participant.identity?.trim()
    || fallback
  );
}

function classroomTrackKey(trackRef: ClassroomTrackReference): string {
  return `${trackRef.participant.sid || trackRef.participant.identity}-${trackRef.source ?? "camera"}`;
}

function classroomSlotKey(slot: ClassroomVideoSlot): string {
  return slot.kind === "track" ? classroomTrackKey(slot.trackRef) : `expected-${slot.subject}`;
}
