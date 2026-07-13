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
const echoTailMs = 240;

type RealtimeFunctionCall = {
  type?: string;
  name?: string;
  arguments?: string;
  call_id?: string;
};

type RealtimeServerEvent = {
  type?: string;
  event_id?: string;
  response?: { output?: RealtimeFunctionCall[] };
};

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
  const microphoneTracks = stream.getAudioTracks();
  let activity: AvatarActivity = "idle";
  let closed = false;
  let greetingRequested = false;
  let learnerSpeechActive = false;
  let microphoneEnabled = true;
  let functionContinuationPending = false;
  let responsePending = false;
  let tutorOutputActive = false;
  let resumeMicrophoneTimer: ReturnType<typeof setTimeout> | null = null;
  const handledFunctionCalls = new Set<string>();

  const setActivity = (next: AvatarActivity) => {
    if (activity === next) return;
    activity = next;
    input.onActivityChange(next);
  };
  const setMicrophoneEnabled = (enabled: boolean) => {
    microphoneEnabled = enabled;
    microphoneTracks.forEach((track) => { track.enabled = enabled; });
  };
  const cancelMicrophoneResume = () => {
    if (resumeMicrophoneTimer !== null) clearTimeout(resumeMicrophoneTimer);
    resumeMicrophoneTimer = null;
  };
  const resumeMicrophoneAfterEchoTail = () => {
    cancelMicrophoneResume();
    if (closed || responsePending || tutorOutputActive) return;
    resumeMicrophoneTimer = setTimeout(() => {
      resumeMicrophoneTimer = null;
      if (closed || responsePending || tutorOutputActive) return;
      learnerSpeechActive = false;
      setMicrophoneEnabled(true);
      setActivity("idle");
    }, echoTailMs);
  };
  const requestResponse = (response?: { instructions: string }) => {
    if (closed || responsePending || events.readyState !== "open") return false;
    cancelMicrophoneResume();
    learnerSpeechActive = false;
    setMicrophoneEnabled(false);
    responsePending = true;
    setActivity("thinking");
    events.send(JSON.stringify(response ? { type: "response.create", response } : { type: "response.create" }));
    return true;
  };
  const close = () => {
    if (closed) return;
    closed = true;
    cancelMicrophoneResume();
    setActivity("idle");
    input.onRemoteAudioStream(null);
    events.close();
    stream.getTracks().forEach((track) => track.stop());
    peer.close();
    remoteAudio.srcObject = null;
  };

  // Keep the microphone closed while the connection and the tutor's first turn start.
  // This avoids treating permission/UI sounds as the learner's first utterance.
  setMicrophoneEnabled(false);

  peer.ontrack = (event) => {
    const remoteStream = event.streams[0] ?? new MediaStream([event.track]);
    remoteAudio.srcObject = remoteStream;
    input.onRemoteAudioStream(remoteStream);
  };
  stream.getTracks().forEach((track) => peer.addTrack(track, stream));

  events.onmessage = (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as RealtimeServerEvent;
      if (payload.type === "session.created" && !greetingRequested) {
        greetingRequested = true;
        events.send(JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            audio: { input: { turn_detection: { type: "server_vad", create_response: false, interrupt_response: false } } },
          },
        }));
        requestResponse({ instructions: "Begin with one brief greeting and the first scenario question, then wait for the learner." });
        return;
      }
      if (payload.type === "input_audio_buffer.speech_started") {
        if (!microphoneEnabled || responsePending || tutorOutputActive) return;
        learnerSpeechActive = true;
        setActivity("listening");
        return;
      }
      if (payload.type === "input_audio_buffer.speech_stopped") {
        if (!learnerSpeechActive || !microphoneEnabled || responsePending || tutorOutputActive) return;
        learnerSpeechActive = false;
        requestResponse();
        return;
      }
      if (payload.type === "output_audio_buffer.started" || payload.type === "response.output_audio.delta" || payload.type === "response.audio.delta") {
        cancelMicrophoneResume();
        learnerSpeechActive = false;
        tutorOutputActive = true;
        setMicrophoneEnabled(false);
        setActivity("speaking");
        return;
      }
      if (payload.type === "output_audio_buffer.stopped" || payload.type === "output_audio_buffer.cleared") {
        tutorOutputActive = false;
        if (functionContinuationPending) {
          functionContinuationPending = false;
          requestResponse();
        } else if (!responsePending) {
          resumeMicrophoneAfterEchoTail();
        }
        return;
      }
      if (payload.type === "response.created") {
        responsePending = true;
        return;
      }
      if (payload.type === "response.done") {
        responsePending = false;
        const functionCall = payload.response?.output?.find(({ type, name, call_id }) =>
          type === "function_call" && name === "evaluate_learner_turn" && Boolean(call_id),
        );
        if (functionCall?.call_id && functionCall.arguments && !handledFunctionCalls.has(functionCall.call_id)) {
          handledFunctionCalls.add(functionCall.call_id);
          const evaluation = parseTurnEvaluation(functionCall.arguments);
          if (evaluation) input.onEvaluation(evaluation, payload.event_id ?? functionCall.call_id);
          if (events.readyState === "open") {
            events.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: functionCall.call_id, output: "{\"shown\":true}" } }));
            if (tutorOutputActive) functionContinuationPending = true;
            else requestResponse();
          }
        } else if (!tutorOutputActive) {
          resumeMicrophoneAfterEchoTail();
        }
        return;
      }
      if (payload.type === "error") {
        responsePending = false;
        tutorOutputActive = false;
        resumeMicrophoneAfterEchoTail();
        input.onError();
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
      requestResponse({ instructions: "Repeat your last sentence slowly, then wait for the learner." });
    },
    close,
  };
}

export function activityForRealtimeEvent(current: AvatarActivity, eventType: string): AvatarActivity {
  if (eventType === "output_audio_buffer.started" || eventType === "response.output_audio.delta" || eventType === "response.audio.delta") return "speaking";
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

function parseTurnEvaluation(argumentsJson: string): RealtimeTurnEvaluation | null {
  try {
    const value = JSON.parse(argumentsJson) as RealtimeTurnEvaluation | null;
    return value && typeof value === "object" && isTurnEvaluation(value) ? value : null;
  } catch {
    return null;
  }
}
