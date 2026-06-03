import { LiveKitRoom } from "@livekit/components-react";
import { PhoneOff, Radio } from "lucide-react";
import { useEffect, useState } from "react";
import { canAssignLessons } from "../../../entities/workspace/model";
import {
  formatLessonRange,
  formatLessonType,
} from "../../../entities/schedule/model";
import {
  type LessonMaterial,
  type MeProfile,
  type ScheduledLesson,
} from "../../../shared/api/playsay";
import { Button } from "../../../components/ui/button";
import type { LessonRoomSession } from "../model/session";
import { ClassroomVideoStage, type ClassroomVideoMode } from "./ClassroomVideoStage";
import { LessonWorkspace } from "./LessonWorkspace";
import { useAppTranslation } from "../../../shared/i18n";

export type ClassroomViewportMode = "desktop" | "mobilePortrait" | "mobileLandscape";

type ClassroomViewportSnapshot = {
  coarsePointer: boolean;
  height: number;
  landscapeQueryMatches: boolean;
  portraitQueryMatches: boolean;
  width: number;
};

const mobilePortraitMaxWidth = 640;
const mobileLandscapeMaxWidth = 1024;
const mobileLandscapeMaxHeight = 640;
const mobilePortraitQuery = `(max-width: ${mobilePortraitMaxWidth}px) and (orientation: portrait)`;
const mobileLandscapeQuery = `(max-width: ${mobileLandscapeMaxWidth}px) and (orientation: landscape) and (max-height: ${mobileLandscapeMaxHeight}px)`;

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
  const { t } = useAppTranslation();
  const translate = (key: string, options?: Record<string, unknown>) => t(key, options);
  const displayName = profile?.name ?? profile?.username ?? t("classroom.participantFallback");
  const lessonTypeLabel = formatLessonType(session.lessonType, translate);
  const canManageLesson = canAssignLessons(profile);
  const videoOnly = !session.materialId && !canManageLesson;
  const viewportMode = useClassroomViewportMode();
  const videoExpanded = viewportMode === "mobileLandscape";
  const classroomVideoMode: ClassroomVideoMode = videoExpanded || (videoOnly && viewportMode === "mobilePortrait")
    ? "focusOnly"
    : videoOnly
      ? "videoOnly"
      : "lesson";
  const showWorkspace = !videoOnly && !videoExpanded;

  useEffect(() => {
    document.body.classList.toggle("playsay-classroom-video-expanded", videoExpanded);

    return () => document.body.classList.remove("playsay-classroom-video-expanded");
  }, [videoExpanded]);

  return (
    <div
      className="playsay-classroom-shell"
      data-video-expanded={videoExpanded ? "true" : "false"}
      data-video-only={videoOnly ? "true" : "false"}
      data-viewport-mode={viewportMode}
    >
      <section className="playsay-video-rail">
        <div className="playsay-video-header">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-extrabold text-primary-foreground">
                <Radio className="h-3.5 w-3.5" />
                {t("classroom.live")}
              </span>
              <span className="playsay-video-type-badge rounded-full border border-white/15 px-2.5 py-1 text-xs font-extrabold text-white/80">
                {lessonTypeLabel}
              </span>
            </div>
            <h1 className="mt-2 truncate text-2xl font-black tracking-normal">{session.lessonTitle}</h1>
            <p className="mt-1 truncate text-sm font-semibold text-white/60">
              {session.courseTitle ?? "Play&Say"} · {formatLessonRange(session.lessonStartsAt, session.lessonEndsAt, translate)}
            </p>
          </div>
          <Button className="playsay-lesson-exit" onClick={onLeave} type="button" variant="outline">
            <PhoneOff className="h-4 w-4" />
            {t("classroom.actions.leave")}
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
            <ClassroomVideoStage mode={classroomVideoMode} />
          </LiveKitRoom>
        </div>
      </section>

      {showWorkspace ? (
        <LessonWorkspace
          displayName={displayName}
          materials={materials}
          onAssignMaterial={onAssignMaterial}
          profile={profile}
          session={session}
        />
      ) : null}
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
