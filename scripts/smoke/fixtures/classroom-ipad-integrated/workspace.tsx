import { useState } from "react";
import { LessonWhiteboard } from "../src/features/classroom/ui/LessonWhiteboard";

// The workspace and persisted board are fixtures; the rendered board, controls,
// drawing stage and styles are the actual develop components.
export function LessonWorkspace({ onPresentationModeChange, onWhiteboardActiveChange }: { onPresentationModeChange: (mode: string) => void; onWhiteboardActiveChange: (active: boolean) => void }) {
  const [board, setBoard] = useState(false);
  return <section className="playsay-workbench" data-whiteboard-active={board}><div className="playsay-workbench-topbar"><button id="material-toolbar" onClick={() => onPresentationModeChange("external-activity-focus")}>External activity</button><button id="external-stop" onClick={() => onPresentationModeChange("default")}>Return</button></div><nav className="playsay-whiteboard-tabs"><button id="fixture-board" onClick={() => { setBoard(true); onWhiteboardActiveChange(true); }}>Board</button><button id="fixture-material" onClick={() => { setBoard(false); onWhiteboardActiveChange(false); }}>Material</button></nav>{board ? <LessonWhiteboard board={{ background: "#ffffff", canDraw: true, canManage: false, readOnly: false } as never} actor="student-1" name="Student" active targetLabel="Group" /> : <div className="playsay-workbench-body"><button id="material-content">Synthetic lesson material</button><input id="material-input" placeholder="Answer" /></div>}</section>;
}
