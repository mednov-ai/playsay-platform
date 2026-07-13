import { afterEach, describe, expect, it, vi } from "vitest";
import { activityForRealtimeEvent, connectRealtimeConversation, isTurnEvaluation, type RealtimeTurnEvaluation } from "./realtimeConversation";

const accepted: RealtimeTurnEvaluation = {
  verdict: "ACCEPTED",
  goalResult: "MET",
  original: "I'd like a tea, please.",
  improved: "",
  explanation: "",
  category: "CLARITY",
  encouragement: "Clear and polite.",
};

describe("Realtime turn evaluation", () => {
  it("accepts a semantically correct answer without forcing an alternative phrase", () => {
    expect(isTurnEvaluation(accepted)).toBe(true);
  });

  it("requires an improved phrase and explanation for IMPROVE", () => {
    expect(isTurnEvaluation({ ...accepted, verdict: "IMPROVE" })).toBe(false);
    expect(isTurnEvaluation({ ...accepted, verdict: "IMPROVE", improved: "I'd like some tea, please.", explanation: "Use some with an uncountable drink." })).toBe(true);
  });

  it("rejects pronunciation as an evaluation category", () => {
    expect(isTurnEvaluation({ ...accepted, category: "PRONUNCIATION" as RealtimeTurnEvaluation["category"] })).toBe(false);
  });
});

describe("Realtime avatar activity", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps learner and tutor audio lifecycle without letting microphone events override tutor speech", () => {
    expect(activityForRealtimeEvent("idle", "input_audio_buffer.speech_started")).toBe("listening");
    expect(activityForRealtimeEvent("listening", "input_audio_buffer.speech_stopped")).toBe("thinking");
    expect(activityForRealtimeEvent("thinking", "output_audio_buffer.started")).toBe("speaking");
    expect(activityForRealtimeEvent("speaking", "input_audio_buffer.speech_started")).toBe("speaking");
    expect(activityForRealtimeEvent("speaking", "response.done")).toBe("speaking");
    expect(activityForRealtimeEvent("speaking", "output_audio_buffer.stopped")).toBe("idle");
  });

  it("publishes the remote audio stream and clears all media resources on close", async () => {
    const localTrack = { stop: vi.fn() };
    const localStream = { getTracks: () => [localTrack] } as unknown as MediaStream;
    const remoteStream = {} as MediaStream;
    const dataChannel = new FakeDataChannel();
    const peer = new FakePeer(dataChannel);
    const audio = { autoplay: false, srcObject: null as MediaProvider | null };
    const onActivityChange = vi.fn();
    const onRemoteAudioStream = vi.fn();

    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(localStream) } });
    vi.stubGlobal("RTCPeerConnection", class { constructor() { return peer; } });
    vi.stubGlobal("Audio", class { constructor() { return audio; } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue("answer-sdp") }));

    const conversation = await connectRealtimeConversation({
      clientSecret: "secret",
      model: "realtime-model",
      onActivityChange,
      onError: vi.fn(),
      onEvaluation: vi.fn(),
      onRemoteAudioStream,
    });

    peer.ontrack?.({ streams: [remoteStream] } as unknown as RTCTrackEvent);
    expect(audio.srcObject).toBe(remoteStream);
    expect(onRemoteAudioStream).toHaveBeenCalledWith(remoteStream);

    dataChannel.onmessage?.({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) } as MessageEvent);
    dataChannel.onmessage?.({ data: JSON.stringify({ type: "input_audio_buffer.speech_stopped" }) } as MessageEvent);
    dataChannel.onmessage?.({ data: JSON.stringify({ type: "output_audio_buffer.started" }) } as MessageEvent);
    expect(onActivityChange.mock.calls.map(([activity]) => activity)).toEqual(["listening", "thinking", "speaking"]);

    conversation.close();
    expect(onActivityChange).toHaveBeenLastCalledWith("idle");
    expect(onRemoteAudioStream).toHaveBeenLastCalledWith(null);
    expect(localTrack.stop).toHaveBeenCalledOnce();
    expect(dataChannel.close).toHaveBeenCalledOnce();
    expect(peer.close).toHaveBeenCalledOnce();
    expect(audio.srcObject).toBeNull();
  });
});

class FakeDataChannel {
  close = vi.fn();
  onmessage: ((event: MessageEvent) => void) | null = null;
  readyState = "open";
  send = vi.fn();
}

class FakePeer {
  addTrack = vi.fn();
  close = vi.fn();
  connectionState = "new";
  createDataChannel = vi.fn(() => this.dataChannel);
  createOffer = vi.fn().mockResolvedValue({ sdp: "offer-sdp", type: "offer" });
  onconnectionstatechange: (() => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  setLocalDescription = vi.fn().mockResolvedValue(undefined);
  setRemoteDescription = vi.fn().mockResolvedValue(undefined);

  constructor(private readonly dataChannel: FakeDataChannel) {}
}
