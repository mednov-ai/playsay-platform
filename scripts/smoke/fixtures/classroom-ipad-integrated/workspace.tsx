export function LessonWorkspace({ onPresentationModeChange }: { onPresentationModeChange: (mode: string) => void }) {
  return <div className="playsay-workbench"><div className="playsay-workbench-topbar"><button id="material-toolbar" onClick={() => onPresentationModeChange("external-activity-focus")}>External activity</button><button id="external-stop" onClick={() => onPresentationModeChange("default")}>Return</button></div><div className="playsay-workbench-body"><button id="material-content">Synthetic lesson material</button><input id="material-input" placeholder="Answer" /></div></div>;
}
