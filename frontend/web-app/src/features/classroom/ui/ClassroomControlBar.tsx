import { StartMediaButton, TrackToggle } from "@livekit/components-react";
import { Track } from "livekit-client";
import { ScreenShare } from "lucide-react";
import { useAppTranslation } from "../../../shared/i18n";

export function ClassroomControlBar({ setControlsRef }: { setControlsRef: (node: HTMLDivElement | null) => void }) {
  const { t } = useAppTranslation();

  return (
    <div className="lk-control-bar playsay-classroom-controls" ref={setControlsRef}>
      <TrackToggle source={Track.Source.Microphone}>{t("classroom.controls.microphone")}</TrackToggle>
      <TrackToggle source={Track.Source.Camera}>{t("classroom.controls.camera")}</TrackToggle>
      <TrackToggle source={Track.Source.ScreenShare}>
        <ScreenShare className="h-4 w-4" />
        {t("classroom.controls.screen")}
      </TrackToggle>
      <StartMediaButton label={t("classroom.controls.startMedia")} />
    </div>
  );
}
