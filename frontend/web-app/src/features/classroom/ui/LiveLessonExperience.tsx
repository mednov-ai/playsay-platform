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

type ClassroomViewportMode = "desktop" | "mobilePortrait" | "mobileLandscape";

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
    const portraitQuery = window.matchMedia("(max-width: 640px) and (orientation: portrait)");
    const landscapeQuery = window.matchMedia("(max-width: 980px) and (orientation: landscape)");

    function updateMode() {
      setMode(classroomViewportMode());
    }

    updateMode();
    portraitQuery.addEventListener("change", updateMode);
    landscapeQuery.addEventListener("change", updateMode);
    window.addEventListener("resize", updateMode);

    return () => {
      portraitQuery.removeEventListener("change", updateMode);
      landscapeQuery.removeEventListener("change", updateMode);
      window.removeEventListener("resize", updateMode);
    };
  }, []);

  return mode;
}

function classroomViewportMode(): ClassroomViewportMode {
  if (window.matchMedia("(max-width: 980px) and (orientation: landscape)").matches) {
    return "mobileLandscape";
  }

  if (window.matchMedia("(max-width: 640px) and (orientation: portrait)").matches) {
    return "mobilePortrait";
  }

  return "desktop";
}
