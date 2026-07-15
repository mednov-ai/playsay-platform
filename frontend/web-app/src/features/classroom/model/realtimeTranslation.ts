import type { LessonTranslationSession } from "../../../shared/api/playsay";

export type TranslationRole = "teacher" | "student";

export type RealtimeTranslationSidecar = {
  close: () => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

type TranslationServerEvent = {
  type?: string;
  delta?: string;
  error?: { message?: string };
};

export async function connectRealtimeTranslation(input: {
  session: LessonTranslationSession;
  sourceTrack: MediaStreamTrack;
  onAudioDelta: () => void;
  onError: () => void;
  onTranscriptDelta: (delta: string) => void;
}): Promise<RealtimeTranslationSidecar> {
  const peer = new RTCPeerConnection();
  const sourceTrack = input.sourceTrack.clone();
  const sender = peer.addTransceiver("audio", { direction: "sendrecv" }).sender;
  const translatedAudio = new Audio();
  translatedAudio.autoplay = true;
  const events = peer.createDataChannel("oai-events");
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    sourceTrack.stop();
    events.close();
    peer.close();
    translatedAudio.pause();
    translatedAudio.srcObject = null;
  };

  peer.ontrack = (event) => {
    translatedAudio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
    void translatedAudio.play().catch(input.onError);
  };
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === "failed" || peer.connectionState === "disconnected") input.onError();
  };
  events.onmessage = (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as TranslationServerEvent;
      if (payload.type === "session.output_transcript.delta" && payload.delta) input.onTranscriptDelta(payload.delta);
      if (payload.type === "session.output_audio.delta") input.onAudioDelta();
      if (payload.type === "error") input.onError();
    } catch {
      // Ignore provider events that are not JSON or are unrelated to translation output.
    }
  };

  try {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const response = await fetch(input.session.callsUrl, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${input.session.clientSecret}`,
        "Content-Type": "application/sdp",
      },
    });
    if (!response.ok) throw new Error(`Realtime translation connection failed (${response.status})`);
    await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
  } catch (error) {
    close();
    throw error;
  }

  return {
    close,
    start: async () => {
      if (closed) throw new Error("Realtime translation sidecar is closed");
      await sender.replaceTrack(sourceTrack);
    },
    stop: async () => {
      if (!closed) await sender.replaceTrack(null);
    },
  };
}

export function translationCollisionWinner(localRole: TranslationRole, incomingRole: TranslationRole): "local" | "incoming" {
  if (localRole === incomingRole) return "local";
  return localRole === "teacher" ? "local" : "incoming";
}

export function appendTranscriptDelta(
  captions: Array<{ id: string; text: string }>,
  id: string,
  delta: string,
): Array<{ id: string; text: string }> {
  const existing = captions.some((caption) => caption.id === id);
  const next = existing
    ? captions.map((caption) => (caption.id === id ? { ...caption, text: caption.text + delta } : caption))
    : [...captions, { id, text: delta }];
  return next.slice(-3);
}
