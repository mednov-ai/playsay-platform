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
  groupCameras: (teacherView: boolean, joined: boolean, reversed: boolean) => {
    const people = [learner, teacher, local, ...(joined ? [participant("student-3", false, "Alexandria Long Learner Name")] : [])];
    cameras = (reversed ? people.reverse() : people).map(p => track({ ...p, isLocal: p.identity === (teacherView ? teacher.identity : local.identity) }));
    emit();
  },
  localTeacherCamera: (enabled: boolean) => {
    cameras = cameras.filter(c => c.participant.identity !== teacher.identity);
    if (enabled) cameras.push(track({ ...teacher, isLocal: true }));
    emit();
  },
  share: (enabled: boolean) => { shares = enabled ? [track(teacher, "screen_share")] : []; emit(); },
  teacherPresent: (enabled: boolean) => { cameras = [track(learner), ...(enabled ? [track(teacher)] : []), track(substitute), track(local)]; emit(); },
  streamState: () => ({ video: streams.get(false)?.getVideoTracks()[0]?.readyState ?? null }),
  counts: { roomMounts: 0, roomUnmounts: 0, audioMounts: 0, audioUnmounts: 0 },
};
const streams = new Map<boolean, MediaStream>();
function syntheticStream(portrait: boolean): MediaStream | undefined {
  const existing = streams.get(portrait);
  if (existing) return existing;
  const canvas = document.createElement("canvas");
  canvas.width = portrait ? 180 : 320;
  canvas.height = portrait ? 320 : 180;
  const ctx = canvas.getContext("2d");
  if (!ctx || !canvas.captureStream) return undefined;
  const draw = () => {
    const { width, height } = canvas;
    ctx.fillStyle = portrait ? "#36635b" : "#385475";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#ffdb66"; ctx.lineWidth = 5;
    ctx.strokeRect(4, 4, width - 8, height - 8);
    ctx.save(); ctx.translate(width / 2, height / 2);
    ctx.fillStyle = "#f7d6bc"; ctx.beginPath(); ctx.ellipse(0, 0, 46, 58, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#242c39";
    for (const x of [-16, 16]) { ctx.beginPath(); ctx.arc(x, -8, 5, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = "#633d3a"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 9, 18, 0.15, Math.PI - 0.15); ctx.stroke();
    ctx.restore();
  };
  draw(); setInterval(draw, 100);
  const stream = canvas.captureStream(10);
  streams.set(portrait, stream);
  return stream;
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
  const portrait = trackRef.participant.identity === "student-2";
  useEffect(() => { if (ref.current) { ref.current.srcObject = syntheticStream(portrait) ?? null; void ref.current.play().catch(() => undefined); } }, [portrait]);
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
