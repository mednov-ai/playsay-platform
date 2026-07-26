import {
  TrackToggle,
  usePersistentUserChoices,
  useRoomContext,
  useStartAudio,
  useStartVideo,
  useTracks,
  useTrackToggle,
} from "@livekit/components-react";
import { getBrowser, Track, type ScreenShareCaptureOptions } from "livekit-client";
import { Languages, LoaderCircle, ScreenShare, Volume2 } from "lucide-react";
import { useState } from "react";
import { useAppTranslation } from "../../../shared/i18n";
import type { LessonTranslationController } from "../hooks/useLessonTranslation";
import type { TranslationRole } from "../model/realtimeTranslation";

type ScreenShareAudioCaptureOptions = Exclude<ScreenShareCaptureOptions["audio"], boolean | undefined> & {
  restrictOwnAudio: ConstrainBoolean;
};

export type ClassroomScreenShareAudioWarning = "missing" | "safari" | null;

const screenShareAudioCaptureOptions: ScreenShareAudioCaptureOptions = {
  restrictOwnAudio: true,
};
const screenShareAudioSources: Track.Source[] = [Track.Source.ScreenShareAudio];

export const classroomScreenShareCaptureOptions = {
  audio: screenShareAudioCaptureOptions,
  systemAudio: "include",
} satisfies ScreenShareCaptureOptions;

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
    saveAudioInputEnabled,
    saveVideoInputEnabled,
  } = usePersistentUserChoices();

  return (
    <div className="lk-control-bar playsay-classroom-controls" ref={setControlsRef}>
      <TrackToggle
        aria-label={t("classroom.controls.microphone")}
        onChange={(enabled, userInitiated) => { if (userInitiated) saveAudioInputEnabled(enabled); }}
        source={Track.Source.Microphone}
        title={t("classroom.controls.microphone")}
      />
      <TrackToggle
        aria-label={t("classroom.controls.camera")}
        onChange={(enabled, userInitiated) => { if (userInitiated) saveVideoInputEnabled(enabled); }}
        source={Track.Source.Camera}
        title={t("classroom.controls.camera")}
      />
      <ClassroomScreenShareToggle />
      <ClassroomStartMediaButton />
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
        </button>
      ) : null}
    </div>
  );
}

function ClassroomStartMediaButton() {
  const { t } = useAppTranslation();
  const room = useRoomContext();
  const label = t("classroom.controls.startMedia");
  const { mergedProps: audioProps, canPlayAudio } = useStartAudio({
    props: { "aria-label": label, title: label },
    room,
  });
  const { mergedProps, canPlayVideo } = useStartVideo({ props: audioProps, room });
  const { style, ...buttonProps } = mergedProps;

  return (
    <button
      {...buttonProps}
      style={{ ...style, display: canPlayAudio && canPlayVideo ? "none" : "inline-flex" }}
      type="button"
    >
      <Volume2 aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}

function ClassroomScreenShareToggle() {
  const { t } = useAppTranslation();
  const room = useRoomContext();
  const [captureSettled, setCaptureSettled] = useState(false);
  const screenShareAudioTracks = useTracks(screenShareAudioSources, { onlySubscribed: false, room });
  const { buttonProps, enabled, toggle } = useTrackToggle({
    "aria-label": t("classroom.controls.screen"),
    captureOptions: classroomScreenShareCaptureOptions,
    room,
    source: Track.Source.ScreenShare,
    title: t("classroom.controls.screen"),
  });
  const screenShareAudioPublished = screenShareAudioTracks.some(
    (trackRef) => trackRef.participant === room.localParticipant && Boolean(trackRef.publication.track),
  );
  const warning = classroomScreenShareAudioWarning(
    captureSettled && enabled,
    screenShareAudioPublished,
    getBrowser()?.name,
  );

  async function handleScreenShareToggle() {
    const nextEnabled = !room.localParticipant.isScreenShareEnabled;
    setCaptureSettled(false);

    try {
      await toggle(nextEnabled);
      setCaptureSettled(room.localParticipant.isScreenShareEnabled);
    } catch {
      setCaptureSettled(room.localParticipant.isScreenShareEnabled);
    }
  }

  return (
    <div className="playsay-screen-share-control">
      <button {...buttonProps} onClick={() => { void handleScreenShareToggle(); }} type="button">
        <ScreenShare className="h-4 w-4" />
      </button>
      {warning ? (
        <div aria-live="polite" className="playsay-screen-share-audio-warning" role="status">
          {t(warning === "safari"
            ? "classroom.controls.screenAudioMissingSafari"
            : "classroom.controls.screenAudioMissing")}
        </div>
      ) : null}
    </div>
  );
}

export function classroomScreenShareAudioWarning(
  screenShareEnabled: boolean,
  screenShareAudioPublished: boolean,
  browserName?: string,
): ClassroomScreenShareAudioWarning {
  if (!screenShareEnabled || screenShareAudioPublished) return null;
  return browserName === "Safari" ? "safari" : "missing";
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
