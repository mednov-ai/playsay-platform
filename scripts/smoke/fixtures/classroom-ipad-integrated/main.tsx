import { useState } from "react";
import { createRoot } from "react-dom/client";
import { LiveLessonExperience } from "../src/features/classroom/ui/LiveLessonExperience";
import type { LessonRoomSession } from "../src/features/classroom/model/session";
import { changeAppLanguage } from "../src/shared/i18n/config";
import { harness } from "./livekit";
import "@livekit/components-styles";
import "../src/styles.css";
import "../src/styles/classroom.css";
import "../src/styles/chat.css";
import "../src/styles/responsive.css";

void changeAppLanguage("en");
function App() {
  const [material, setMaterial] = useState(true);
  const [teacher, setTeacher] = useState(false);
  Object.assign(window, { integratedFixture: { ...harness, setMaterial, setTeacher } });
  const session = {
    courseTitle: "Course", expiresAt: "2030-01-01T00:00:00Z", identity: "student-1", lessonId: "lesson-1",
    lessonStartsAt: null, lessonEndsAt: null, lessonStatus: "IN_PROGRESS", lessonTemplateId: null,
    lessonTitle: "Lesson", lessonTranslationAllowed: false, lessonType: "GROUP", lessonUpdatedAt: "2026-01-01T00:00:00Z",
    materialId: material ? "material-1" : null,
    mediaChoices: { audioDeviceId: "default", audioEnabled: false, audioOutputDeviceId: "default", videoDeviceId: "default", videoEnabled: false },
    participants: [{ subject: "student-1" }, { subject: "student-2" }], participantPresence: {}, roomName: "lesson-1",
    serverUrl: "wss://fixture.invalid", teacherName: "Teacher", teacherSubject: "teacher-1", token: "fixture", workMode: "SHARED",
  } as LessonRoomSession;
  return <main className="h-dvh overflow-hidden bg-background text-foreground"><section className="mx-auto flex w-full flex-col h-full max-w-[92rem] gap-3 px-3 py-3 sm:px-4"><LiveLessonExperience materials={[]} onAssignMaterial={async () => null} onComplete={() => undefined} onLeave={() => undefined} onMediaLifecycleChange={() => undefined} onRetryMedia={() => undefined} profile={teacher ? { roles: ["TEACHER"] } as never : null} recoveryPhase="idle" session={session} /></section></main>;
}
createRoot(document.getElementById("root")!).render(<App />);
