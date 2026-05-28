import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ConnectionStateToast, ParticipantTile, RoomAudioRenderer, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { ScreenShare, Video } from "lucide-react";
import { ClassroomControlBar } from "./ClassroomControlBar";
import { useAppTranslation } from "../../../shared/i18n";

type ClassroomTrackReference = ReturnType<typeof useTracks>[number];
type ClassroomStripLayout = "single" | "row";
type ClassroomVideoMode = "lesson" | "videoOnly";

export function ClassroomVideoStage({ mode }: { mode: ClassroomVideoMode }) {
  const { t } = useAppTranslation();
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
                <span>{t("classroom.video.emptyParticipants")}</span>
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
            {participantDisplayName(remoteScreenShareTrack, t("classroom.participantFallback"))}
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

function ClassroomGridVideoTile({ trackRef }: { trackRef: ClassroomTrackReference }) {
  const { t } = useAppTranslation();
  const label = participantDisplayName(trackRef, t("classroom.participantFallback"));

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
  const { t } = useAppTranslation();
  const label = participantDisplayName(trackRef, t("classroom.participantFallback"));

  return (
    <div className="playsay-video-card" data-layout={layout}>
      <ParticipantTile trackRef={trackRef} />
      <div className="playsay-video-card-label" title={label}>
        {label}
      </div>
    </div>
  );
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
