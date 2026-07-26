import {
  TrackToggle,
  usePersistentUserChoices,
  useRoomContext,
  useStartAudio,
  useStartVideo,
  useTracks,
  useTrackToggle,
} from "@livekit/components-react";
import { getBrowser, Track, type LocalParticipant, type ScreenShareCaptureOptions } from "livekit-client";
import { Languages, LoaderCircle, ScreenShare, ScreenShareOff, Volume2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
  preferCurrentTab: false,
  selfBrowserSurface: "exclude",
  surfaceSwitching: "include",
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
  const [captureState, setCaptureState] = useState<"idle" | "requesting" | "active" | "stopping" | "error">("idle");
  const screenShareAudioTracks = useTracks(screenShareAudioSources, { onlySubscribed: false, room });
  const screenShareVideoTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false, room });
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
    captureState === "active" && room.localParticipant.isScreenShareEnabled,
    screenShareAudioPublished,
    getBrowser()?.name,
  );

  const stopScreenShare = useCallback(async () => {
    setCaptureState("stopping");
    try {
      await room.localParticipant.setScreenShareEnabled(false);
      await waitForLocalScreenShareToStop(room.localParticipant);
      setCaptureState(localScreenSharePublished(room.localParticipant) ? "error" : "idle");
    } catch {
      setCaptureState(localScreenSharePublished(room.localParticipant) ? "error" : "idle");
    }
  }, [room.localParticipant]);

  async function handleScreenShareToggle() {
    if (room.localParticipant.isScreenShareEnabled || captureState === "active" || captureState === "error") {
      await stopScreenShare();
      return;
    }
    setCaptureState("requesting");
    try {
      await toggle(true);
      setCaptureState(room.localParticipant.isScreenShareEnabled ? "active" : "error");
    } catch {
      setCaptureState(room.localParticipant.isScreenShareEnabled ? "active" : "error");
    }
  }

  useEffect(() => {
    if (enabled && captureState === "idle") setCaptureState("active");
    if (!enabled && captureState === "active") setCaptureState("idle");
  }, [captureState, enabled]);

  const localScreenTrack = screenShareVideoTracks.find(
    (trackRef) => trackRef.participant === room.localParticipant && Boolean(trackRef.publication.track),
  )?.publication.track?.mediaStreamTrack;
  useEffect(() => {
    if (!localScreenTrack) return undefined;
    const handleEnded = () => { void stopScreenShare(); };
    localScreenTrack.addEventListener("ended", handleEnded);
    return () => localScreenTrack.removeEventListener("ended", handleEnded);
  }, [localScreenTrack, stopScreenShare]);

  const label = captureState === "stopping"
    ? t("classroom.controls.screenStopping")
    : room.localParticipant.isScreenShareEnabled || captureState === "active" || captureState === "error"
      ? t("classroom.controls.screenStop")
      : captureState === "requesting"
        ? t("classroom.controls.screenStarting")
        : t("classroom.controls.screen");

  return (
    <div className="playsay-screen-share-control">
      <button
        {...buttonProps}
        aria-label={label}
        data-state={captureState}
        disabled={captureState === "requesting" || captureState === "stopping"}
        onClick={() => { void handleScreenShareToggle(); }}
        title={label}
        type="button"
      >
        {captureState === "requesting" || captureState === "stopping"
          ? <LoaderCircle className="h-4 w-4 animate-spin" />
          : room.localParticipant.isScreenShareEnabled || captureState === "active" || captureState === "error"
            ? <ScreenShareOff className="h-4 w-4" />
            : <ScreenShare className="h-4 w-4" />}
      </button>
      {captureState === "requesting" ? (
        <div className="playsay-screen-share-audio-warning" role="status">
          {t("classroom.controls.screenPickerHint")}
        </div>
      ) : null}
      {captureState === "error" ? (
        <div className="playsay-screen-share-audio-warning" role="alert">
          {t("classroom.controls.screenStopError")}
        </div>
      ) : null}
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

async function waitForLocalScreenShareToStop(
  participant: LocalParticipant,
  timeoutMs = 1_500,
) {
  const startedAt = performance.now();
  while (localScreenSharePublished(participant) && performance.now() - startedAt < timeoutMs) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }
}

function localScreenSharePublished(participant: LocalParticipant) {
  return participant.isScreenShareEnabled
    || Boolean(participant.getTrackPublication?.(Track.Source.ScreenShare)?.track)
    || Boolean(participant.getTrackPublication?.(Track.Source.ScreenShareAudio)?.track);
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
