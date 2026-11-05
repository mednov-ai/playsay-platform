import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { LessonExtensionOffer } from "../src/features/classroom/ui/LessonExtensionOffer";
import { requestClassroomFullscreen } from "../src/features/classroom/ui/LiveLessonExperience";
import type { LessonRoomSession } from "../src/features/classroom/model/session";
import { observeServerTime } from "../src/shared/lib/serverClock";
import { changeAppLanguage } from "../src/shared/i18n/config";
import "../src/styles.css";
import "../src/styles/classroom.css";
import "../src/styles/chat.css";
import "../src/styles/responsive.css";

const now = Date.parse("2026-11-05T07:53:00Z");
observeServerTime({ serverNow: new Date(now).toISOString() });
const params = new URLSearchParams(location.search);
void changeAppLanguage(params.get("locale") ?? "ru");
const mode = params.get("mode");
const expanded = params.has("expanded");
const focus = params.has("focus");
const before = params.has("before");
document.body.classList.toggle("playsay-classroom-video-expanded", expanded);
document.body.classList.toggle("playsay-classroom-external-activity-focus", focus);

function App() {
  const shell = useRef<HTMLDivElement>(null);
  const [revision, setRevision] = useState(0);
  const [clock, setClock] = useState(before ? now - 1000 : now);
  const [hasPolicy, setHasPolicy] = useState(!params.has("missing"));
  (window as Window & { advanceLessonTime?: (milliseconds: number) => void }).advanceLessonTime = setClock;
  (window as Window & { recoverLessonPolicy?: () => void }).recoverLessonPolicy = () => setHasPolicy(true);
  const session = {
    lessonId: "synthetic", canExtend: hasPolicy ? mode !== "student" : null, accessRevision: revision,
    accessEndsAt: new Date(now + 120_000 + revision * 600_000).toISOString(),
  } as LessonRoomSession;
  return <main className="h-dvh overflow-hidden bg-background text-foreground" data-playsay-tools-layout={mode === "teacher" ? "true" : undefined}>
    <section className="mx-auto flex w-full flex-col h-full max-w-[92rem] gap-3 px-3 py-3 sm:px-4">
      <LessonExtensionOffer session={session} nowMs={clock} canManageSchedule={mode !== "student"} onExtend={async () => setRevision(value => value + 1)} />
      <div ref={shell} className="playsay-classroom-shell" data-video-expanded={expanded ? "true" : "false"} data-presentation-mode={focus ? "external-activity-focus" : "default"}>
        <section className="playsay-video-rail">
          <button id="fullscreen" style={{ pointerEvents: "auto" }} onClick={() => void requestClassroomFullscreen(shell.current)}>Fullscreen</button>
          <button id="lesson-control" style={{ position: "absolute", bottom: 8, pointerEvents: "auto" }}>Lesson control</button>
        </section>
      </div>
    </section>
    <output id="revision" hidden>{revision}</output>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
