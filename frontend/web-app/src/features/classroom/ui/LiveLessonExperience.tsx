import { LiveKitRoom } from "@livekit/components-react";
import { Radio } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canAssignLessons } from "../../../entities/workspace/model";
import {
  type LessonMaterial,
  type MeProfile,
  type ScheduledLesson,
} from "../../../shared/api/playsay";
import type { LessonRoomSession } from "../model/session";
import { lessonLiveKitRoomConnectOptions, lessonLiveKitRoomOptions, liveKitRoomInstanceKey } from "../model/liveKitRoomOptions";
import { ClassroomVideoStage, type ClassroomVideoMode } from "./ClassroomVideoStage";
import { ClassroomConnectionStatus } from "./ClassroomConnectionStatus";
import { ClassroomMediaTransportProbe } from "./ClassroomMediaTransportProbe";
import { LessonWorkspace } from "./LessonWorkspace";
import type { LessonPresentationMode } from "./LessonTaskCanvas";
import { useAppTranslation } from "../../../shared/i18n";
import type { MediaTransportEvidence } from "../model/mediaTransportEvidence";

export type ClassroomViewportMode = "desktop" | "mobilePortrait" | "mobileLandscape";

type ClassroomViewportSnapshot = {
  coarsePointer: boolean;
  height: number;
  landscapeQueryMatches: boolean;
  portraitQueryMatches: boolean;
  width: number;
};

type FullscreenCapableElement = HTMLElement & {
  webkitRequestFullScreen?: () => Promise<void> | void;
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenCapableDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
};

const mobilePortraitMaxWidth = 640;
const mobileLandscapeMaxWidth = 1024;
const mobileLandscapeMaxHeight = 640;
const mobilePortraitQuery = `(max-width: ${mobilePortraitMaxWidth}px) and (orientation: portrait)`;
const mobileLandscapeQuery = `(max-width: ${mobileLandscapeMaxWidth}px) and (orientation: landscape) and (max-height: ${mobileLandscapeMaxHeight}px)`;

export function LiveLessonExperience({
  materials,
  onAssignMaterial,
  onComplete,
  onLeave,
  profile,
  session,
}: {
  materials: LessonMaterial[];
  onAssignMaterial: (lessonId: string, materialId: string | null) => Promise<ScheduledLesson | null>;
  onComplete: () => void;
  onLeave: () => void;
  profile: MeProfile | null;
  session: LessonRoomSession;
}) {
  const { t } = useAppTranslation();
  const shellRef = useRef<HTMLDivElement>(null);
  const [fullscreenActive, setFullscreenActive] = useState(() => classroomFullscreenActive());
  const [fullscreenPending, setFullscreenPending] = useState(false);
  const [presentationMode, setPresentationMode] = useState<LessonPresentationMode>("default");
  const [screenShareActive, setScreenShareActive] = useState(false);
  const [mediaTransportEvidence, setMediaTransportEvidence] = useState<MediaTransportEvidence>({
    allRelayed: false,
    peerConnectionCount: 0,
    transportClass: "unknown",
  });
  const updateMediaTransportEvidence = useCallback((next: MediaTransportEvidence) => {
    setMediaTransportEvidence((current) => (
      current.allRelayed === next.allRelayed
      && current.peerConnectionCount === next.peerConnectionCount
      && current.transportClass === next.transportClass
        ? current
        : next
    ));
  }, []);
  const displayName = profile?.name ?? profile?.username ?? t("classroom.participantFallback");
  const canManageLesson = canAssignLessons(profile);
  const translationRole = session.identity === session.teacherSubject
    ? "teacher"
    : session.participants.some((participant) => participant.subject === session.identity)
      ? "student"
      : null;
  const videoOnly = !session.materialId && !canManageLesson;
  const rawViewportMode = useClassroomViewportMode();
  const viewportMode = effectiveClassroomViewportMode(rawViewportMode, canManageLesson);
  const videoExpanded = classroomVideoExpanded(viewportMode, screenShareActive);
  const externalActivityFocus = presentationMode === "external-activity-focus";
  const classroomVideoMode: ClassroomVideoMode = externalActivityFocus
    ? "externalActivity"
    : videoExpanded || (videoOnly && viewportMode === "mobilePortrait")
      ? "focusOnly"
      : videoOnly
        ? "videoOnly"
        : "lesson";
  const showWorkspace = shouldShowLessonWorkspace({ canManageLesson, screenShareActive, videoOnly, viewportMode });
  const liveKitRoomOptions = useMemo(
    () => lessonLiveKitRoomOptions(session.mediaChoices.audioOutputDeviceId),
    [session.mediaChoices.audioOutputDeviceId],
  );
  const liveKitRoomConnectOptions = useMemo(
    () => lessonLiveKitRoomConnectOptions(session.mediaRouting),
    [session.mediaRouting],
  );
  const liveKitInstanceKey = liveKitRoomInstanceKey(
    session.roomName,
    session.expiresAt,
    session.serverUrl,
    session.mediaRouting,
  );

  useEffect(() => {
    document.body.classList.toggle("playsay-classroom-video-expanded", videoExpanded);

    return () => document.body.classList.remove("playsay-classroom-video-expanded");
  }, [videoExpanded]);

  useEffect(() => {
    document.body.classList.toggle("playsay-classroom-external-activity-focus", externalActivityFocus);

    return () => document.body.classList.remove("playsay-classroom-external-activity-focus");
  }, [externalActivityFocus]);

  useEffect(() => {
    function updateFullscreenState() {
      setFullscreenActive(classroomFullscreenActive(shellRef.current));
    }

    updateFullscreenState();
    document.addEventListener("fullscreenchange", updateFullscreenState);
    document.addEventListener("webkitfullscreenchange", updateFullscreenState);

    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreenState);
      document.removeEventListener("webkitfullscreenchange", updateFullscreenState);
    };
  }, []);

  async function toggleFullscreen() {
    if (fullscreenPending) {
      return;
    }

    setFullscreenPending(true);
    try {
      if (classroomFullscreenActive(shellRef.current)) {
        await exitClassroomFullscreen();
      } else {
        await requestClassroomFullscreen(shellRef.current);
      }
    } finally {
      setFullscreenPending(false);
      setFullscreenActive(classroomFullscreenActive(shellRef.current));
    }
  }

  const fullscreenLabel = fullscreenActive
    ? t("classroom.actions.exitFullscreen")
    : t("classroom.actions.enterFullscreen");

  return (
    <div
      className="playsay-classroom-shell"
      data-presentation-mode={presentationMode}
      data-connection-role={canManageLesson ? "teacher" : "learner"}
      data-media-all-relayed={mediaTransportEvidence.allRelayed ? "true" : "false"}
      data-media-peer-connections={mediaTransportEvidence.peerConnectionCount}
      data-media-transport-class={mediaTransportEvidence.transportClass}
      data-screen-share-active={screenShareActive ? "true" : "false"}
      data-video-expanded={videoExpanded ? "true" : "false"}
      data-video-only={videoOnly ? "true" : "false"}
      data-viewport-mode={viewportMode}
      ref={shellRef}
    >
      <LiveKitRoom
        audio={session.mediaChoices.audioEnabled ? {
          autoGainControl: true,
          deviceId: session.mediaChoices.audioDeviceId,
          echoCancellation: true,
          noiseSuppression: true,
        } : false}
        className="playsay-livekit-context"
        connect
        connectOptions={liveKitRoomConnectOptions}
        data-lk-theme="default"
        key={liveKitInstanceKey}
        options={liveKitRoomOptions}
        serverUrl={session.serverUrl}
        token={session.token}
        video={session.mediaChoices.videoEnabled ? { deviceId: session.mediaChoices.videoDeviceId } : false}
      >
        <ClassroomMediaTransportProbe onEvidence={updateMediaTransportEvidence} serverUrl={session.serverUrl} />
        <section className="playsay-video-rail">
          <div className="playsay-video-header">
            <span className="playsay-video-live-badge">
              <Radio className="h-3.5 w-3.5" />
              {t("classroom.live")}
            </span>
            <ClassroomConnectionStatus
              canManageLesson={canManageLesson}
              learnerSubjects={session.participants.map((participant) => participant.subject)}
            />
            <h1 title={session.lessonTitle}>{session.lessonTitle}</h1>
          </div>

          <div className="playsay-classroom-room min-h-0 flex-1">
            <ClassroomVideoStage
              expectedParticipants={session.participants}
              lessonId={session.lessonId}
              lessonType={session.lessonType}
              mode={classroomVideoMode}
              canCompleteLesson={canManageLesson}
              fullscreenActive={fullscreenActive}
              fullscreenLabel={fullscreenLabel}
              fullscreenPending={fullscreenPending}
              onComplete={onComplete}
              onLeave={onLeave}
              onScreenShareActiveChange={setScreenShareActive}
              onToggleFullscreen={() => void toggleFullscreen()}
              participantPresence={session.participantPresence}
              showExpectedParticipants={canManageLesson}
              showLearnerConnectionDots={canManageLesson}
              translationAllowed={session.lessonTranslationAllowed}
              translationRole={translationRole}
            />
          </div>
        </section>

        {showWorkspace ? (
          <LessonWorkspace
            displayName={displayName}
            materials={materials}
            onAssignMaterial={onAssignMaterial}
            onPresentationModeChange={setPresentationMode}
            presentationMode={presentationMode}
            profile={profile}
            session={session}
          />
        ) : null}
      </LiveKitRoom>
    </div>
  );
}

function useClassroomViewportMode(): ClassroomViewportMode {
  const [mode, setMode] = useState<ClassroomViewportMode>(() => classroomViewportMode());

  useEffect(() => {
    const portraitQuery = window.matchMedia(mobilePortraitQuery);
    const landscapeQuery = window.matchMedia(mobileLandscapeQuery);
    const visualViewport = window.visualViewport;

    function updateMode() {
      setMode(classroomViewportMode());
    }

    updateMode();
    portraitQuery.addEventListener("change", updateMode);
    landscapeQuery.addEventListener("change", updateMode);
    window.addEventListener("orientationchange", updateMode);
    window.addEventListener("resize", updateMode);
    visualViewport?.addEventListener("resize", updateMode);

    return () => {
      portraitQuery.removeEventListener("change", updateMode);
      landscapeQuery.removeEventListener("change", updateMode);
      window.removeEventListener("orientationchange", updateMode);
      window.removeEventListener("resize", updateMode);
      visualViewport?.removeEventListener("resize", updateMode);
    };
  }, []);

  return mode;
}

export function classroomViewportMode(): ClassroomViewportMode {
  return classroomViewportModeFromSnapshot(readClassroomViewportSnapshot());
}

export function effectiveClassroomViewportMode(
  viewportMode: ClassroomViewportMode,
  _canManageLesson: boolean,
): ClassroomViewportMode {
  return viewportMode;
}

export function shouldShowLessonWorkspace({
  canManageLesson: _canManageLesson,
  screenShareActive,
  videoOnly,
  viewportMode,
}: {
  canManageLesson: boolean;
  screenShareActive: boolean;
  videoOnly: boolean;
  viewportMode: ClassroomViewportMode;
}): boolean {
  if (screenShareActive || videoOnly || viewportMode === "mobileLandscape") {
    return false;
  }

  return true;
}

export function classroomVideoExpanded(viewportMode: ClassroomViewportMode, screenShareActive: boolean): boolean {
  return screenShareActive || viewportMode === "mobileLandscape";
}

export function classroomFullscreenActive(shell?: HTMLElement | null): boolean {
  const fullscreenElement = document.fullscreenElement ?? (document as FullscreenCapableDocument).webkitFullscreenElement ?? null;

  return fullscreenElement !== null && (
    shell === undefined ||
    shell === null ||
    fullscreenElement === shell ||
    shell.contains(fullscreenElement) ||
    fullscreenElement.contains(shell)
  );
}

export async function requestClassroomFullscreen(shell: HTMLElement | null): Promise<boolean> {
  if (!shell) {
    return false;
  }

  const toolsLayout = typeof shell.closest === "function"
    ? shell.closest<HTMLElement>("[data-playsay-tools-layout]")
    : null;
  const fullscreenShell = (toolsLayout ?? shell) as FullscreenCapableElement;
  if (fullscreenShell.requestFullscreen) {
    await fullscreenShell.requestFullscreen({ navigationUI: "hide" });
    return true;
  }

  const requestWebkitFullscreen = fullscreenShell.webkitRequestFullscreen ?? fullscreenShell.webkitRequestFullScreen;
  if (requestWebkitFullscreen) {
    await Promise.resolve(requestWebkitFullscreen.call(fullscreenShell));
    return true;
  }

  return false;
}

async function exitClassroomFullscreen(): Promise<boolean> {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return true;
  }

  const fullscreenDocument = document as FullscreenCapableDocument;
  if (fullscreenDocument.webkitFullscreenElement && fullscreenDocument.webkitExitFullscreen) {
    await Promise.resolve(fullscreenDocument.webkitExitFullscreen());
    return true;
  }

  return false;
}

export function classroomViewportModeFromSnapshot(snapshot: ClassroomViewportSnapshot): ClassroomViewportMode {
  const isLandscape = snapshot.width > snapshot.height;
  const isPhoneLikeLandscape = isLandscape &&
    snapshot.coarsePointer &&
    snapshot.width <= mobileLandscapeMaxWidth &&
    snapshot.height <= mobileLandscapeMaxHeight;
  const isPhoneLikePortrait = snapshot.height >= snapshot.width &&
    snapshot.width <= mobilePortraitMaxWidth;

  if ((snapshot.landscapeQueryMatches && snapshot.coarsePointer) || isPhoneLikeLandscape) {
    return "mobileLandscape";
  }

  if (snapshot.portraitQueryMatches || isPhoneLikePortrait) {
    return "mobilePortrait";
  }

  return "desktop";
}

function readClassroomViewportSnapshot(): ClassroomViewportSnapshot {
  const width = Math.round(window.innerWidth || document.documentElement.clientWidth);
  const height = Math.round(window.innerHeight || document.documentElement.clientHeight);

  return {
    coarsePointer: window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0,
    height,
    landscapeQueryMatches: window.matchMedia(mobileLandscapeQuery).matches,
    portraitQueryMatches: window.matchMedia(mobilePortraitQuery).matches,
    width,
  };
}
