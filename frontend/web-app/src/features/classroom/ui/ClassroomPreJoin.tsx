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
} from "lucide-react";
import {
  Track,
  VideoPresets,
  type LocalAudioTrack,
  type LocalVideoTrack,
} from "livekit-client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { ScheduledLesson } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { BrandMark } from "../../../shared/ui/BrandMark";
import { Button } from "../../../components/ui/button";
import type { ClassroomMediaChoices } from "../model/session";

type AudioCheckState = "idle" | "recording" | "playing" | "confirm" | "passed" | "failed" | "tooShort";
export type PreJoinWarning = "camera" | "microphone" | "speaker";

const speakerDeviceStorageKey = "playsay.classroom.audio-output.v1";
const minimumRecordingDurationMs = 300;
const maximumRecordingDurationMs = 5_000;

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
  const [microphoneRecorded, setMicrophoneRecorded] = useState(false);
  const [speakerConfirmed, setSpeakerConfirmed] = useState(false);
  const [audioCheckState, setAudioCheckState] = useState<AudioCheckState>("idle");
  const [showWarning, setShowWarning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const recordingGenerationRef = useRef(0);
  const recordingTimerRef = useRef<number | null>(null);
  const playbackRef = useRef<HTMLAudioElement | null>(null);
  const playbackUrlRef = useRef<string | null>(null);

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

  useEffect(() => () => {
    recordingGenerationRef.current += 1;
    disposeAudioCheckResources();
  }, []);

  const warnings = preJoinWarnings({
    cameraReady: !videoEnabled || Boolean(videoTrack),
    microphoneReady: audioEnabled && microphoneRecorded,
    speakerReady: speakerConfirmed,
  });
  const microphoneLevel = normalizedMicrophoneLevel(microphoneVolume);
  const audioCheckReady = audioEnabled && microphoneRecorded && speakerConfirmed;
  const audioCheckMessage = !audioEnabled
    ? t("classroom.preJoin.microphoneOff")
    : audioCheckState === "recording"
      ? t("classroom.preJoin.recording")
      : audioCheckState === "playing"
        ? t("classroom.preJoin.playingRecording")
        : audioCheckState === "tooShort"
          ? t("classroom.preJoin.recordingTooShort")
          : audioCheckState === "failed"
            ? t("classroom.preJoin.recordingFailed")
            : audioCheckState === "passed"
              ? t("classroom.preJoin.speakerReady")
              : t("classroom.preJoin.recordingPrompt");

  function changeAudioEnabled(enabled: boolean) {
    resetAudioCheck();
    setAudioEnabled(enabled);
    saveAudioInputEnabled(enabled);
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
    resetAudioCheck();
    setAudioDeviceId(deviceId);
    saveAudioInputDeviceId(deviceId);
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
    resetAudioCheck();
    setAudioOutputDeviceId(deviceId);
    saveSpeakerDeviceId(deviceId);
    setShowWarning(false);
  }

  function resetAudioCheck() {
    recordingGenerationRef.current += 1;
    disposeAudioCheckResources();
    setMicrophoneRecorded(false);
    setSpeakerConfirmed(false);
    setAudioCheckState("idle");
  }

  function disposeAudioCheckResources() {
    if (recordingTimerRef.current !== null) {
      window.clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder?.state === "recording") recorder.stop();
    const playback = playbackRef.current;
    playbackRef.current = null;
    if (playback) {
      playback.pause();
      playback.removeAttribute("src");
      playback.load();
    }
    if (playbackUrlRef.current) {
      URL.revokeObjectURL(playbackUrlRef.current);
      playbackUrlRef.current = null;
    }
  }

  function startAudioRecording() {
    if (!audioEnabled || !audioTrack || audioCheckState === "playing" || typeof MediaRecorder === "undefined") {
      setAudioCheckState("failed");
      return;
    }

    recordingGenerationRef.current += 1;
    const generation = recordingGenerationRef.current;
    disposeAudioCheckResources();
    setSpeakerConfirmed(false);
    setAudioCheckState("recording");
    recordingChunksRef.current = [];
    recordingStartedAtRef.current = performance.now();

    try {
      const stream = new MediaStream([audioTrack.mediaStreamTrack]);
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (generation === recordingGenerationRef.current && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        if (generation === recordingGenerationRef.current) setAudioCheckState("failed");
      };
      recorder.onstop = () => {
        if (recordingTimerRef.current !== null) {
          window.clearTimeout(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        recorderRef.current = null;
        if (generation !== recordingGenerationRef.current) return;
        const durationMs = performance.now() - recordingStartedAtRef.current;
        if (durationMs < minimumRecordingDurationMs) {
          setMicrophoneRecorded(false);
          setAudioCheckState("tooShort");
          return;
        }
        const recording = new Blob(recordingChunksRef.current, { type: recorder.mimeType || undefined });
        if (recording.size === 0) {
          setMicrophoneRecorded(false);
          setAudioCheckState("failed");
          return;
        }
        setMicrophoneRecorded(true);
        void playAudioRecording(recording, audioOutputDeviceId, generation);
      };
      recorder.start();
      recordingTimerRef.current = window.setTimeout(() => stopAudioRecording(), maximumRecordingDurationMs);
    } catch {
      setMicrophoneRecorded(false);
      setAudioCheckState("failed");
    }
  }

  function stopAudioRecording(cancelled = false) {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    if (cancelled) recordingGenerationRef.current += 1;
    recorder.stop();
    if (cancelled) setAudioCheckState("idle");
  }

  async function playAudioRecording(recording: Blob, deviceId: string, generation: number) {
    setAudioCheckState("playing");
    try {
      const url = URL.createObjectURL(recording);
      playbackUrlRef.current = url;
      const audio = new Audio(url) as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      playbackRef.current = audio;
      if (deviceId && deviceId !== "default" && audio.setSinkId) await audio.setSinkId(deviceId);
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("Audio playback failed."));
        void audio.play().catch(reject);
      });
      if (generation === recordingGenerationRef.current) setAudioCheckState("confirm");
    } catch {
      if (generation === recordingGenerationRef.current) setAudioCheckState("failed");
    } finally {
      const playback = playbackRef.current;
      playbackRef.current = null;
      if (playback) {
        playback.removeAttribute("src");
        playback.load();
      }
      if (playbackUrlRef.current) {
        URL.revokeObjectURL(playbackUrlRef.current);
        playbackUrlRef.current = null;
      }
    }
  }

  function startRecordingFromPointer(event: PointerEvent<HTMLButtonElement>) {
    if (event.button > 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    startAudioRecording();
  }

  function stopRecordingFromPointer(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    stopAudioRecording(cancelled);
  }

  function startRecordingFromKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if ((event.key !== " " && event.key !== "Enter") || event.repeat) return;
    event.preventDefault();
    startAudioRecording();
  }

  function stopRecordingFromKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    stopAudioRecording();
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
            ready={audioCheckReady}
            title={t("classroom.preJoin.soundTitle")}
          >
            <div className="playsay-prejoin-audio-devices">
              <DeviceSelect
                devices={audioDevices}
                fallbackLabel={t("classroom.preJoin.microphoneFallback")}
                label={t("classroom.preJoin.microphoneSelect")}
                onChange={changeAudioDevice}
                value={audioDeviceId}
              />
              {canSelectAudioOutput ? (
                <DeviceSelect
                  devices={audioOutputDevices}
                  fallbackLabel={t("classroom.preJoin.speakerFallback")}
                  label={t("classroom.preJoin.speakerSelect")}
                  onChange={changeAudioOutputDevice}
                  value={audioOutputDeviceId}
                />
              ) : (
                <div className="playsay-prejoin-system-output">
                  <span>{t("classroom.preJoin.speakerSelect")}</span>
                  <strong>{t("classroom.preJoin.speakerSystemDefaultShort")}</strong>
                </div>
              )}
            </div>
            <div
              aria-label={t("classroom.preJoin.microphoneLevel")}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={microphoneLevel}
              className="playsay-prejoin-meter"
              role="progressbar"
            >
              <span style={{ width: `${microphoneLevel}%` }} />
            </div>
            <div aria-live="polite" className="playsay-prejoin-audio-result" data-state={audioCheckState}>
              <p>{audioCheckState === "confirm" ? t("classroom.preJoin.didYouHearRecording") : audioCheckMessage}</p>
              {audioCheckState === "confirm" ? (
                <div className="playsay-prejoin-audio-confirm">
                  <Button onClick={() => { setSpeakerConfirmed(true); setAudioCheckState("passed"); setShowWarning(false); }} type="button">
                    {t("classroom.preJoin.heardYes")}
                  </Button>
                  <Button onClick={() => { setSpeakerConfirmed(false); setAudioCheckState("failed"); }} type="button" variant="outline">
                    {t("classroom.preJoin.heardNo")}
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="playsay-prejoin-audio-actions">
              <Button
                data-recording={audioCheckState === "recording" ? "true" : "false"}
                disabled={!audioEnabled || !audioTrack || audioCheckState === "playing" || joining}
                onBlur={() => stopAudioRecording(true)}
                onKeyDown={startRecordingFromKeyboard}
                onKeyUp={stopRecordingFromKeyboard}
                onPointerCancel={(event) => stopRecordingFromPointer(event, true)}
                onPointerDown={startRecordingFromPointer}
                onPointerUp={stopRecordingFromPointer}
                type="button"
                variant={audioCheckState === "recording" ? "default" : "outline"}
              >
                {audioCheckState === "playing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                {audioCheckState === "recording"
                  ? t("classroom.preJoin.recording")
                  : audioCheckState === "playing"
                    ? t("classroom.preJoin.playingRecording")
                    : t("classroom.preJoin.holdToRecord")}
              </Button>
              <Button onClick={() => changeAudioEnabled(!audioEnabled)} type="button" variant="outline">
                {audioEnabled ? t("classroom.preJoin.turnOff") : t("classroom.preJoin.turnOn")}
              </Button>
            </div>
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
  return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
}

export function normalizedMicrophoneLevel(volume: number): number {
  if (!Number.isFinite(volume) || volume <= 0) return 0;
  return Math.round(Math.min(100, Math.pow(volume, 1.35) * 125));
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
