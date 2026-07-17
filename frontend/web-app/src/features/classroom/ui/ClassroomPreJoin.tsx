import {
  useMediaDevices,
  usePersistentUserChoices,
  usePreviewTracks,
  useTrackVolume,
} from "@livekit/components-react";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  CheckCircle2,
  CircleAlert,
  Loader2,
  Mic,
  MicOff,
  Play,
  Speaker,
} from "lucide-react";
import {
  Track,
  VideoPresets,
  type LocalAudioTrack,
  type LocalVideoTrack,
} from "livekit-client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ScheduledLesson } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { BrandMark } from "../../../shared/ui/BrandMark";
import { Button } from "../../../components/ui/button";
import type { ClassroomMediaChoices } from "../model/session";

type SpeakerTestState = "idle" | "playing" | "confirm" | "passed" | "failed";
export type PreJoinWarning = "camera" | "microphone" | "speaker";

const speakerDeviceStorageKey = "playsay.classroom.audio-output.v1";
const microphoneSignalThreshold = 0.035;

export function ClassroomPreJoin({
  joining,
  lesson,
  message,
  onBack,
  onJoin,
}: {
  joining: boolean;
  lesson: ScheduledLesson;
  message: string | null;
  onBack: () => void;
  onJoin: (choices: ClassroomMediaChoices) => Promise<void>;
}) {
  const { t } = useAppTranslation();
  const {
    userChoices,
    saveAudioInputDeviceId,
    saveAudioInputEnabled,
    saveVideoInputDeviceId,
    saveVideoInputEnabled,
  } = usePersistentUserChoices();
  const [audioEnabled, setAudioEnabled] = useState(userChoices.audioEnabled);
  const [videoEnabled, setVideoEnabled] = useState(userChoices.videoEnabled);
  const [audioDeviceId, setAudioDeviceId] = useState(userChoices.audioDeviceId || "default");
  const [videoDeviceId, setVideoDeviceId] = useState(userChoices.videoDeviceId || "default");
  const [audioOutputDeviceId, setAudioOutputDeviceId] = useState(loadSpeakerDeviceId);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [microphoneDetected, setMicrophoneDetected] = useState(false);
  const [speakerTest, setSpeakerTest] = useState<SpeakerTestState>("idle");
  const [showWarning, setShowWarning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handlePreviewError = useCallback((error: Error) => {
    setPreviewError(error.name || error.message);
  }, []);
  const tracks = usePreviewTracks({
    audio: !joining && audioEnabled
      ? {
          autoGainControl: true,
          deviceId: audioDeviceId,
          echoCancellation: true,
          noiseSuppression: true,
        }
      : false,
    video: !joining && videoEnabled
      ? {
          deviceId: videoDeviceId,
          resolution: VideoPresets.h720.resolution,
        }
      : false,
  }, handlePreviewError);
  const audioTrack = useMemo(
    () => tracks?.find((track) => track.kind === Track.Kind.Audio) as LocalAudioTrack | undefined,
    [tracks],
  );
  const videoTrack = useMemo(
    () => tracks?.find((track) => track.kind === Track.Kind.Video) as LocalVideoTrack | undefined,
    [tracks],
  );
  const microphoneVolume = useTrackVolume(audioTrack, { fftSize: 64, smoothingTimeConstant: 0.35 });
  const audioDevices = useMediaDevices({ kind: "audioinput" });
  const videoDevices = useMediaDevices({ kind: "videoinput" });
  const audioOutputDevices = useMediaDevices({ kind: "audiooutput" });
  const canSelectAudioOutput = supportsAudioOutputSelection();

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !videoTrack) return undefined;
    videoTrack.unmute();
    videoTrack.attach(videoElement);
    return () => { videoTrack.detach(videoElement); };
  }, [videoTrack]);

  useEffect(() => {
    if (audioEnabled && microphoneVolume >= microphoneSignalThreshold) {
      setMicrophoneDetected(true);
    }
  }, [audioEnabled, microphoneVolume]);

  const warnings = preJoinWarnings({
    cameraReady: !videoEnabled || Boolean(videoTrack),
    microphoneReady: audioEnabled && microphoneDetected,
    speakerReady: speakerTest === "passed",
  });

  function changeAudioEnabled(enabled: boolean) {
    setAudioEnabled(enabled);
    saveAudioInputEnabled(enabled);
    setMicrophoneDetected(false);
    setPreviewError(null);
    setShowWarning(false);
  }

  function changeVideoEnabled(enabled: boolean) {
    setVideoEnabled(enabled);
    saveVideoInputEnabled(enabled);
    setPreviewError(null);
    setShowWarning(false);
  }

  function changeAudioDevice(deviceId: string) {
    setAudioDeviceId(deviceId);
    saveAudioInputDeviceId(deviceId);
    setMicrophoneDetected(false);
    setPreviewError(null);
    setShowWarning(false);
  }

  function changeVideoDevice(deviceId: string) {
    setVideoDeviceId(deviceId);
    saveVideoInputDeviceId(deviceId);
    setPreviewError(null);
    setShowWarning(false);
  }

  function changeAudioOutputDevice(deviceId: string) {
    setAudioOutputDeviceId(deviceId);
    saveSpeakerDeviceId(deviceId);
    setSpeakerTest("idle");
    setShowWarning(false);
  }

  async function testSpeaker() {
    setSpeakerTest("playing");
    try {
      await playSpeakerTest(audioOutputDeviceId);
      setSpeakerTest("confirm");
    } catch {
      setSpeakerTest("failed");
    }
  }

  async function submit() {
    if (warnings.length > 0 && !showWarning) {
      setShowWarning(true);
      return;
    }
    await onJoin({
      audioDeviceId,
      audioEnabled,
      audioOutputDeviceId,
      videoDeviceId,
      videoEnabled,
    });
  }

  return (
    <section className="playsay-prejoin" aria-labelledby="playsay-prejoin-title">
      <header className="playsay-prejoin-header">
        <BrandMark />
        <Button aria-label={t("classroom.preJoin.back")} onClick={onBack} type="button" variant="outline">
          <ArrowLeft className="h-4 w-4" />
          {t("classroom.preJoin.back")}
        </Button>
      </header>

      <div className="playsay-prejoin-intro">
        <span>{t("classroom.preJoin.eyebrow")}</span>
        <h1 id="playsay-prejoin-title">{t("classroom.preJoin.title")}</h1>
        <p>{t("classroom.preJoin.subtitle", { lesson: lesson.lessonTitle ?? lesson.courseTitle ?? t("schedule.lessonFallbackTitle") })}</p>
      </div>

      <div className="playsay-prejoin-grid">
        <div className="playsay-prejoin-preview">
          {videoEnabled && videoTrack ? (
            <video aria-label={t("classroom.preJoin.cameraPreview")} autoPlay muted playsInline ref={videoRef} />
          ) : (
            <div className="playsay-prejoin-camera-off">
              <CameraOff className="h-10 w-10" />
              <strong>{videoEnabled ? t("classroom.preJoin.cameraStarting") : t("classroom.preJoin.cameraOff")}</strong>
            </div>
          )}
          <div className="playsay-prejoin-preview-label">
            <Camera className="h-4 w-4" />
            {videoTrack ? t("classroom.preJoin.cameraReady") : t("classroom.preJoin.cameraCheck")}
          </div>
        </div>

        <div className="playsay-prejoin-checks">
          <DeviceCheckCard
            icon={audioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            ready={audioEnabled && microphoneDetected}
            title={t("classroom.preJoin.microphoneTitle")}
          >
            <DeviceSelect
              devices={audioDevices}
              fallbackLabel={t("classroom.preJoin.microphoneFallback")}
              label={t("classroom.preJoin.microphoneSelect")}
              onChange={changeAudioDevice}
              value={audioDeviceId}
            />
            <div className="playsay-prejoin-meter" aria-label={t("classroom.preJoin.microphoneLevel")}>
              <span style={{ width: `${Math.max(3, Math.min(100, microphoneVolume * 360))}%` }} />
            </div>
            <p>{audioEnabled
              ? microphoneDetected ? t("classroom.preJoin.microphoneReady") : t("classroom.preJoin.microphonePrompt")
              : t("classroom.preJoin.microphoneOff")}</p>
            <Button onClick={() => changeAudioEnabled(!audioEnabled)} type="button" variant="outline">
              {audioEnabled ? t("classroom.preJoin.turnOff") : t("classroom.preJoin.turnOn")}
            </Button>
          </DeviceCheckCard>

          <DeviceCheckCard
            icon={<Camera className="h-5 w-5" />}
            ready={!videoEnabled || Boolean(videoTrack)}
            title={t("classroom.preJoin.cameraTitle")}
          >
            <DeviceSelect
              devices={videoDevices}
              fallbackLabel={t("classroom.preJoin.cameraFallback")}
              label={t("classroom.preJoin.cameraSelect")}
              onChange={changeVideoDevice}
              value={videoDeviceId}
            />
            <p>{videoEnabled
              ? videoTrack ? t("classroom.preJoin.cameraReady") : t("classroom.preJoin.cameraStarting")
              : t("classroom.preJoin.cameraOptional")}</p>
            <Button onClick={() => changeVideoEnabled(!videoEnabled)} type="button" variant="outline">
              {videoEnabled ? t("classroom.preJoin.turnOff") : t("classroom.preJoin.turnOn")}
            </Button>
          </DeviceCheckCard>

          <DeviceCheckCard
            icon={<Speaker className="h-5 w-5" />}
            ready={speakerTest === "passed"}
            title={t("classroom.preJoin.speakerTitle")}
          >
            {canSelectAudioOutput ? (
              <DeviceSelect
                devices={audioOutputDevices}
                fallbackLabel={t("classroom.preJoin.speakerFallback")}
                label={t("classroom.preJoin.speakerSelect")}
                onChange={changeAudioOutputDevice}
                value={audioOutputDeviceId}
              />
            ) : <p>{t("classroom.preJoin.speakerSystemDefault")}</p>}
            <Button disabled={speakerTest === "playing"} onClick={() => void testSpeaker()} type="button" variant="outline">
              {speakerTest === "playing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {t("classroom.preJoin.testSound")}
            </Button>
            {speakerTest === "confirm" || speakerTest === "failed" ? (
              <div className="playsay-prejoin-heard">
                <span>{t("classroom.preJoin.didYouHear")}</span>
                <Button onClick={() => { setSpeakerTest("passed"); setShowWarning(false); }} type="button">
                  {t("classroom.preJoin.heardYes")}
                </Button>
                <Button onClick={() => setSpeakerTest("failed")} type="button" variant="outline">
                  {t("classroom.preJoin.heardNo")}
                </Button>
              </div>
            ) : speakerTest === "passed" ? <p>{t("classroom.preJoin.speakerReady")}</p> : null}
          </DeviceCheckCard>
        </div>
      </div>

      {previewError ? (
        <div className="playsay-prejoin-notice" role="alert">
          <CircleAlert className="h-5 w-5" />
          <span>{t("classroom.preJoin.deviceError", { error: previewError })}</span>
        </div>
      ) : null}
      {message ? <div className="playsay-prejoin-notice" role="status">{message}</div> : null}
      {showWarning && warnings.length > 0 ? (
        <div className="playsay-prejoin-warning" role="alert">
          <CircleAlert className="h-5 w-5" />
          <div>
            <strong>{t("classroom.preJoin.warningTitle")}</strong>
            <p>{warnings.map((warning) => t(`classroom.preJoin.warning.${warning}`)).join(" · ")}</p>
          </div>
        </div>
      ) : null}

      <footer className="playsay-prejoin-footer">
        <div>
          <CheckCircle2 className="h-5 w-5" />
          <span>{warnings.length === 0 ? t("classroom.preJoin.allReady") : t("classroom.preJoin.canContinue")}</span>
        </div>
        <Button
          className="playsay-prejoin-join"
          data-testid="classroom-prejoin-join"
          disabled={joining}
          onClick={() => void submit()}
          type="button"
        >
          {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {showWarning && warnings.length > 0 ? t("classroom.preJoin.continueAnyway") : t("classroom.preJoin.join")}
        </Button>
      </footer>
    </section>
  );
}

function DeviceCheckCard({
  children,
  icon,
  ready,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  ready: boolean;
  title: string;
}) {
  const { t } = useAppTranslation();
  return (
    <article className="playsay-prejoin-card" data-ready={ready ? "true" : "false"}>
      <header>
        <span>{icon}</span>
        <strong>{title}</strong>
        <small>{ready ? t("classroom.preJoin.statusReady") : t("classroom.preJoin.statusCheck")}</small>
      </header>
      {children}
    </article>
  );
}

function DeviceSelect({
  devices,
  fallbackLabel,
  label,
  onChange,
  value,
}: {
  devices: MediaDeviceInfo[];
  fallbackLabel: string;
  label: string;
  onChange: (deviceId: string) => void;
  value: string;
}) {
  const options = devices.length > 0 ? devices : [{ deviceId: "default", label: fallbackLabel } as MediaDeviceInfo];
  const selectedValue = options.some((device) => device.deviceId === value) ? value : options[0]?.deviceId ?? "default";
  return (
    <label className="playsay-prejoin-select">
      <span>{label}</span>
      <select onChange={(event) => onChange(event.target.value)} value={selectedValue}>
        {options.map((device, index) => (
          <option key={device.deviceId || `${index}`} value={device.deviceId || "default"}>
            {device.label || `${fallbackLabel} ${index + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}

export function preJoinWarnings(input: {
  cameraReady: boolean;
  microphoneReady: boolean;
  speakerReady: boolean;
}): PreJoinWarning[] {
  const warnings: PreJoinWarning[] = [];
  if (!input.microphoneReady) warnings.push("microphone");
  if (!input.speakerReady) warnings.push("speaker");
  if (!input.cameraReady) warnings.push("camera");
  return warnings;
}

export function supportsAudioOutputSelection(): boolean {
  if (typeof AudioContext === "undefined") return false;
  return "setSinkId" in AudioContext.prototype;
}

export async function playSpeakerTest(deviceId: string): Promise<void> {
  const context = new AudioContext() as AudioContext & { setSinkId?: (id: string) => Promise<void> };
  try {
    if (deviceId && context.setSinkId) await context.setSinkId(deviceId);
    await context.resume();
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, context.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.55);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.58);
    await new Promise<void>((resolve) => { oscillator.onended = () => resolve(); });
  } finally {
    await context.close();
  }
}

function loadSpeakerDeviceId(): string {
  try {
    return window.localStorage.getItem(speakerDeviceStorageKey) || "default";
  } catch {
    return "default";
  }
}

function saveSpeakerDeviceId(deviceId: string) {
  try {
    window.localStorage.setItem(speakerDeviceStorageKey, deviceId);
  } catch {
    // Device choice remains active for this page even when storage is unavailable.
  }
}
