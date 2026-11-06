import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Mic, Video } from "lucide-react";

const participant = (identity: string, isLocal: boolean, name: string) => ({ identity, isLocal, name, sid: identity });
const local = participant("student-1", true, "Student One");
const teacher = participant("teacher-1", false, "Teacher");
const substitute = participant("teacher-2", false, "Substitute");
const learner = participant("student-2", false, "Student Two");
const track = (p: typeof local, source = "camera") => ({ participant: p, source, publication: { trackName: source, isMuted: false } });
let cameras = [track(learner), track(teacher), track(substitute), track(local)];
let shares: ReturnType<typeof track>[] = [];
const listeners = new Set<() => void>();
let revision = 0;
const emit = () => { revision += 1; listeners.forEach((fn) => fn()); };
export const harness = {
  share: (enabled: boolean) => { shares = enabled ? [track(teacher, "screen_share")] : []; emit(); },
  teacherPresent: (enabled: boolean) => { cameras = [track(learner), ...(enabled ? [track(teacher)] : []), track(substitute), track(local)]; emit(); },
  streamState: () => ({ video: mediaStream?.getVideoTracks()[0]?.readyState ?? null }),
  counts: { roomMounts: 0, roomUnmounts: 0, audioMounts: 0, audioUnmounts: 0 },
};
let canvas: HTMLCanvasElement | undefined;
let mediaStream: MediaStream | undefined;
function syntheticStream(): MediaStream | undefined {
  if (mediaStream) return mediaStream;
  canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 180;
  const context = canvas.getContext("2d");
  if (!context || !canvas.captureStream) return undefined;
  let frame = 0;
  setInterval(() => { context.fillStyle = frame++ % 2 ? "#182c40" : "#456790"; context.fillRect(0, 0, 320, 180); }, 100);
  mediaStream = canvas.captureStream(10);
  return mediaStream;
}
export function LiveKitRoom({ children, className }: { children: ReactNode; className: string }) {
  useEffect(() => { harness.counts.roomMounts++; return () => { harness.counts.roomUnmounts++; }; }, []);
  return <div className={className} data-lk-theme="default" data-testid="mock-livekit-room">{children}</div>;
}
export function useTracks(sources: Array<{ source: string } | string>) {
  useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => revision);
  const source = typeof sources[0] === "string" ? sources[0] : sources[0]?.source;
  return source === "camera" ? cameras : source === "screen_share" ? shares : [];
}
export function ParticipantTile({ trackRef }: { trackRef: ReturnType<typeof track> }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) { ref.current.srcObject = syntheticStream() ?? null; void ref.current.play().catch(() => undefined); } }, []);
  return <div className="lk-participant-tile" data-subject={trackRef.participant.identity}><video className="lk-participant-media-video" autoPlay muted playsInline ref={ref} /><span>{trackRef.participant.name}</span></div>;
}
export function RoomAudioRenderer() { useEffect(() => { harness.counts.audioMounts++; return () => { harness.counts.audioUnmounts++; }; }, []); return <audio data-testid="mock-room-audio" />; }
export function ConnectionStateToast() { return null; }
export function usePersistentUserChoices() { return { saveAudioInputEnabled() {}, saveVideoInputEnabled() {} }; }
export function TrackToggle({ children, source, ...props }: { children: ReactNode; source: string }) { return <button {...props} className="lk-button" type="button">{source === "microphone" ? <Mic aria-hidden="true" /> : <Video aria-hidden="true" />}{children}</button>; }
const room = { localParticipant: { ...local, isScreenShareEnabled: false, async setScreenShareEnabled() {} } };
export function useRoomContext() { return room; }
export function useStartAudio({ props }: { props: object }) { return { mergedProps: props, canPlayAudio: true }; }
export function useStartVideo({ props }: { props: object }) { return { mergedProps: props, canPlayVideo: true }; }
export function useTrackToggle() { return { buttonProps: { className: "lk-button" }, enabled: false, async toggle() {} }; }
