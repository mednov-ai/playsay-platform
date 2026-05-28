import { StartMediaButton, TrackToggle } from "@livekit/components-react";
import { Track } from "livekit-client";
import { ScreenShare } from "lucide-react";

export function ClassroomControlBar({ setControlsRef }: { setControlsRef: (node: HTMLDivElement | null) => void }) {
  return (
    <div className="lk-control-bar playsay-classroom-controls" ref={setControlsRef}>
      <TrackToggle source={Track.Source.Microphone}>Микрофон</TrackToggle>
      <TrackToggle source={Track.Source.Camera}>Камера</TrackToggle>
      <TrackToggle source={Track.Source.ScreenShare}>
        <ScreenShare className="h-4 w-4" />
        Экран
      </TrackToggle>
      <StartMediaButton label="Включить медиа" />
    </div>
  );
}
