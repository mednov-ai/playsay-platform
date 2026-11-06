import { createRoot } from "react-dom/client";
import { useState } from "react";
import { ClassroomFloatingWindow } from "../src/features/classroom/ui/ClassroomFloatingWindow";
import { changeAppLanguage } from "../src/shared/i18n/config";
import "@livekit/components-styles";
import "../src/styles.css";
import "../src/styles/classroom.css";
import "../src/styles/chat.css";
import "../src/styles/responsive.css";

void changeAppLanguage(new URLSearchParams(location.search).get("locale") ?? "ru");

// Exercise the actual floating window and geometry against a synthetic workspace.
// Camera/media, the real classroom and iOS system gestures are not simulated.
function App() {
  const [selected, setSelected] = useState("Teacher");
  return <main className="h-dvh overflow-hidden bg-background text-foreground">
    <section className="mx-auto flex w-full flex-col h-full max-w-[92rem] gap-3 px-3 py-3 sm:px-4">
      <div className="playsay-classroom-shell" data-tablet-floating="true" data-video-expanded="false" data-video-only="false" data-viewport-mode="tablet" data-presentation-mode="default">
        <div className="playsay-livekit-context" data-lk-theme="default">
          <section className="playsay-video-rail">
            <header className="playsay-video-header"><span className="playsay-video-live-badge">Live</span><h1>Lesson</h1></header>
            <div className="playsay-classroom-room min-h-0 flex-1">
              <div className="playsay-classroom-conference" data-mode="tablet-floating">
                <div id="workspace" className="playsay-tablet-video-area">
                  <ClassroomFloatingWindow>
                    <div className="playsay-tablet-video-content">
                      <div className="playsay-tablet-teacher-video" style={{ background: "#355171", color: "white", display: "grid", placeItems: "center" }}>{selected}</div>
                      <div className="playsay-tablet-local-video" style={{ background: "#d17b43", color: "white" }}>Me</div>
                      <details className="playsay-tablet-other-participants">
                        <summary aria-label="Other participants">+4</summary>
                        <div className="playsay-tablet-other-list">
                          {["Student A", "Student B", "Student C", "Student D"].map(name => <button className="playsay-tablet-other-select" key={name} type="button" onClick={event => { setSelected(name); event.currentTarget.closest("details")?.removeAttribute("open"); }}><div className="playsay-video-card" data-layout="row">{name}</div></button>)}
                        </div>
                      </details>
                    </div>
                  </ClassroomFloatingWindow>
                </div>
                <footer id="lesson-controls" className="lk-control-bar playsay-classroom-controls"><button className="lk-button">Microphone</button><button className="lk-button">Camera</button></footer>
              </div>
            </div>
          </section>
          <div className="playsay-workbench" data-presentation-mode="default">
            <div className="playsay-workbench-topbar"><button id="workbench-control">Lesson tool</button></div>
            <div id="lesson-material" className="playsay-workbench-body"><button id="material-interaction">Lesson material: read and write</button></div>
          </div>
        </div>
      </div>
    </section>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
