import { MediaDeviceMenu, StartMediaButton, TrackToggle, usePersistentUserChoices } from "@livekit/components-react";
import { Track } from "livekit-client";
import { ChevronUp, Languages, LoaderCircle, ScreenShare } from "lucide-react";
import { useAppTranslation } from "../../../shared/i18n";
import type { LessonTranslationController } from "../hooks/useLessonTranslation";
import type { TranslationRole } from "../model/realtimeTranslation";

export function ClassroomControlBar({
  role,
  setControlsRef,
  translation,
}: {
  role: TranslationRole | null;
  setControlsRef: (node: HTMLDivElement | null) => void;
  translation: LessonTranslationController;
}) {
  const { t } = useAppTranslation();
  const {
    saveAudioInputDeviceId,
    saveAudioInputEnabled,
    saveVideoInputDeviceId,
    saveVideoInputEnabled,
  } = usePersistentUserChoices();

  return (
    <div className="lk-control-bar playsay-classroom-controls" ref={setControlsRef}>
      <div className="lk-button-group playsay-device-control">
        <TrackToggle onChange={(enabled, userInitiated) => { if (userInitiated) saveAudioInputEnabled(enabled); }} source={Track.Source.Microphone}>
          {t("classroom.controls.microphone")}
        </TrackToggle>
        <MediaDeviceMenu
          aria-label={t("classroom.controls.chooseMicrophone")}
          kind="audioinput"
          onActiveDeviceChange={(_kind, deviceId) => saveAudioInputDeviceId(deviceId)}
          title={t("classroom.controls.chooseMicrophone")}
        >
          <ChevronUp className="h-4 w-4" />
        </MediaDeviceMenu>
      </div>
      <div className="lk-button-group playsay-device-control">
        <TrackToggle onChange={(enabled, userInitiated) => { if (userInitiated) saveVideoInputEnabled(enabled); }} source={Track.Source.Camera}>
          {t("classroom.controls.camera")}
        </TrackToggle>
        <MediaDeviceMenu
          aria-label={t("classroom.controls.chooseCamera")}
          kind="videoinput"
          onActiveDeviceChange={(_kind, deviceId) => saveVideoInputDeviceId(deviceId)}
          title={t("classroom.controls.chooseCamera")}
        >
          <ChevronUp className="h-4 w-4" />
        </MediaDeviceMenu>
      </div>
      <TrackToggle source={Track.Source.ScreenShare}>
        <ScreenShare className="h-4 w-4" />
        {t("classroom.controls.screen")}
      </TrackToggle>
      <StartMediaButton label={t("classroom.controls.startMedia")} />
      {role && (translation.canEnable || translation.localEnabled) ? (
        <button
          aria-label={translationButtonLabel(translation, role, t)}
          aria-pressed={translation.status === "speaking"}
          className="lk-button playsay-translation-button"
          data-active={translation.status === "speaking" || translation.status === "starting" ? "true" : "false"}
          data-status={translation.status}
          disabled={translation.localEnabled && !translation.canPress && translation.status !== "starting" && translation.status !== "speaking"}
          onClick={() => { if (!translation.localEnabled) translation.enable(); }}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (translation.localEnabled && !event.repeat && (event.key === " " || event.key === "Enter")) {
              event.preventDefault();
              translation.beginPress();
            }
          }}
          onKeyUp={(event) => {
            if (translation.localEnabled && (event.key === " " || event.key === "Enter")) {
              event.preventDefault();
              translation.endPress();
            }
          }}
          onPointerCancel={translation.endPress}
          onPointerDown={(event) => {
            if (!translation.localEnabled) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
            translation.beginPress();
          }}
          onPointerUp={(event) => {
            if (!translation.localEnabled) return;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            event.preventDefault();
            translation.endPress();
          }}
          title={translationButtonLabel(translation, role, t)}
          type="button"
        >
          {translation.status === "connecting" || translation.status === "starting" || translation.status === "draining"
            ? <LoaderCircle className="h-4 w-4 animate-spin" />
            : <Languages className="h-4 w-4" />}
          <span>{translationButtonLabel(translation, role, t)}</span>
        </button>
      ) : null}
    </div>
  );
}

function translationButtonLabel(
  translation: LessonTranslationController,
  role: TranslationRole,
  t: (key: string) => string,
): string {
  if (!translation.localEnabled) return t("classroom.translation.enable");
  if (translation.status === "speaking") return t("classroom.translation.release");
  if (translation.status === "starting") return t("classroom.translation.starting");
  if (translation.status === "ready") {
    return role === "teacher" ? t("classroom.translation.holdTeacher") : t("classroom.translation.holdStudent");
  }
  return t("classroom.translation.unavailable");
}
