import type { AvatarActivity } from "./avatarAnimation";

export type RealtimeConversation = {
  close: () => void;
  repeat: () => void;
};

export type RealtimeTurnEvaluation = {
  verdict: "ACCEPTED" | "IMPROVE";
  goalResult: "MET" | "PARTIAL" | "NOT_MET";
  original: string;
  improved: string;
  explanation: string;
  category: "GRAMMAR" | "VOCABULARY" | "RELEVANCE" | "CLARITY";
  encouragement: string;
};

const turnVerdicts = new Set(["ACCEPTED", "IMPROVE"]);
const goalResults = new Set(["MET", "PARTIAL", "NOT_MET"]);
const issueCategories = new Set(["GRAMMAR", "VOCABULARY", "RELEVANCE", "CLARITY"]);

export async function connectRealtimeConversation(input: {
  clientSecret: string;
  model: string;
  onActivityChange: (activity: AvatarActivity) => void;
  onError: () => void;
  onEvaluation: (evaluation: RealtimeTurnEvaluation, eventId: string) => void;
  onRemoteAudioStream: (stream: MediaStream | null) => void;
}): Promise<RealtimeConversation> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const peer = new RTCPeerConnection();
  const remoteAudio = new Audio();
  remoteAudio.autoplay = true;
  const events = peer.createDataChannel("oai-events");
  let activity: AvatarActivity = "idle";
  let closed = false;

  const setActivity = (next: AvatarActivity) => {
    if (activity === next) return;
    activity = next;
    input.onActivityChange(next);
  };
  const close = () => {
    if (closed) return;
    closed = true;
    setActivity("idle");
    input.onRemoteAudioStream(null);
    events.close();
    stream.getTracks().forEach((track) => track.stop());
    peer.close();
    remoteAudio.srcObject = null;
  };

  peer.ontrack = (event) => {
    const remoteStream = event.streams[0] ?? new MediaStream([event.track]);
    remoteAudio.srcObject = remoteStream;
    input.onRemoteAudioStream(remoteStream);
  };
  stream.getTracks().forEach((track) => peer.addTrack(track, stream));

  events.onmessage = (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as { type?: string; name?: string; arguments?: string; call_id?: string; event_id?: string };
      if (payload.type) setActivity(activityForRealtimeEvent(activity, payload.type));
      if (payload.type === "error") input.onError();
      if (payload.type === "response.function_call_arguments.done" && payload.name === "evaluate_learner_turn" && payload.arguments) {
        const evaluation = JSON.parse(payload.arguments) as RealtimeTurnEvaluation;
        if (isTurnEvaluation(evaluation)) input.onEvaluation(evaluation, payload.event_id ?? payload.call_id ?? crypto.randomUUID());
        if (payload.call_id && events.readyState === "open") {
          events.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: payload.call_id, output: "{\"shown\":true}" } }));
          events.send(JSON.stringify({ type: "response.create" }));
        }
      }
    } catch { /* Provider events that are not JSON are ignored. */ }
  };
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === "failed" || peer.connectionState === "disconnected") input.onError();
  };

  try {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const endpoint = import.meta.env.VITE_OPENAI_REALTIME_CALLS_URL ?? "https://api.openai.com/v1/realtime/calls";
    const response = await fetch(`${endpoint}?model=${encodeURIComponent(input.model)}`, {
      method: "POST",
      body: offer.sdp,
      headers: { Authorization: `Bearer ${input.clientSecret}`, "Content-Type": "application/sdp" },
    });
    if (!response.ok) throw new Error(`Realtime connection failed (${response.status})`);
    await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
  } catch (error) {
    close();
    throw error;
  }

  return {
    repeat: () => {
      if (events.readyState === "open") {
        events.send(JSON.stringify({ type: "response.create", response: { instructions: "Repeat your last sentence slowly, then wait for the learner." } }));
      }
    },
    close,
  };
}

export function activityForRealtimeEvent(current: AvatarActivity, eventType: string): AvatarActivity {
  if (eventType === "output_audio_buffer.started" || eventType === "response.audio.delta") return "speaking";
  if (eventType === "output_audio_buffer.stopped") return "idle";
  if (eventType === "response.done") return current === "speaking" ? current : "idle";
  if (eventType === "input_audio_buffer.speech_started") return current === "speaking" ? current : "listening";
  if (eventType === "input_audio_buffer.speech_stopped") return current === "speaking" ? current : "thinking";
  return current;
}

export function isTurnEvaluation(value: RealtimeTurnEvaluation): boolean {
  return turnVerdicts.has(value.verdict) && goalResults.has(value.goalResult) && issueCategories.has(value.category) && Boolean(value.original && value.encouragement)
    && (value.verdict === "ACCEPTED" || Boolean(value.improved && value.explanation));
}
