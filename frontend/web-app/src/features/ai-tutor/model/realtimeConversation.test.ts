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
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("maps learner and tutor audio lifecycle without letting microphone events override tutor speech", () => {
    expect(activityForRealtimeEvent("idle", "input_audio_buffer.speech_started")).toBe("listening");
    expect(activityForRealtimeEvent("listening", "input_audio_buffer.speech_stopped")).toBe("thinking");
    expect(activityForRealtimeEvent("thinking", "output_audio_buffer.started")).toBe("speaking");
    expect(activityForRealtimeEvent("speaking", "input_audio_buffer.speech_started")).toBe("speaking");
    expect(activityForRealtimeEvent("speaking", "response.done")).toBe("speaking");
    expect(activityForRealtimeEvent("speaking", "output_audio_buffer.stopped")).toBe("idle");
  });

  it("runs one greeting and one response per learner turn without reacting to tutor audio", async () => {
    vi.useFakeTimers();
    const localTrack = { enabled: true, stop: vi.fn() };
    const localStream = { getAudioTracks: () => [localTrack], getTracks: () => [localTrack] } as unknown as MediaStream;
    const remoteStream = {} as MediaStream;
    const dataChannel = new FakeDataChannel();
    const peer = new FakePeer(dataChannel);
    const audio = { autoplay: false, srcObject: null as MediaProvider | null };
    const onActivityChange = vi.fn();
    const onEvaluation = vi.fn();
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
      onEvaluation,
      onRemoteAudioStream,
    });

    expect(localTrack.enabled).toBe(false);
    dataChannel.receive({ type: "session.created" });
    dataChannel.receive({ type: "session.created" });
    expect(dataChannel.sentEventsOfType("session.update")).toHaveLength(1);
    expect(dataChannel.sentEventsOfType("response.create")).toHaveLength(1);

    peer.ontrack?.({ streams: [remoteStream] } as unknown as RTCTrackEvent);
    expect(audio.srcObject).toBe(remoteStream);
    expect(onRemoteAudioStream).toHaveBeenCalledWith(remoteStream);

    dataChannel.receive({ type: "response.created" });
    dataChannel.receive({ type: "output_audio_buffer.started" });
    dataChannel.receive({ type: "input_audio_buffer.speech_started" });
    dataChannel.receive({ type: "input_audio_buffer.speech_stopped" });
    expect(dataChannel.sentEventsOfType("response.create")).toHaveLength(1);
    dataChannel.receive({ type: "response.done", response: { output: [] } });
    dataChannel.receive({ type: "output_audio_buffer.stopped" });
    await vi.advanceTimersByTimeAsync(239);
    expect(localTrack.enabled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(localTrack.enabled).toBe(true);

    dataChannel.receive({ type: "input_audio_buffer.speech_started" });
    dataChannel.receive({ type: "input_audio_buffer.speech_stopped" });
    dataChannel.receive({
      type: "response.done",
      event_id: "evaluation-event",
      response: {
        output: [{
          type: "function_call",
          name: "evaluate_learner_turn",
          call_id: "evaluation-call",
          arguments: JSON.stringify(accepted),
        }],
      },
    });
    expect(onEvaluation).toHaveBeenCalledWith(accepted, "evaluation-event");
    expect(dataChannel.sentEventsOfType("conversation.item.create")).toHaveLength(1);
    expect(dataChannel.sentEventsOfType("response.create")).toHaveLength(3);
    expect(localTrack.enabled).toBe(false);

    dataChannel.receive({
      type: "response.done",
      response: {
        output: [{
          type: "function_call",
          name: "evaluate_learner_turn",
          call_id: "invalid-evaluation-call",
          arguments: "not-json",
        }],
      },
    });
    expect(dataChannel.sentEventsOfType("conversation.item.create")).toHaveLength(2);
    expect(dataChannel.sentEventsOfType("response.create")).toHaveLength(4);

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

  receive(event: object) {
    this.onmessage?.({ data: JSON.stringify(event) } as MessageEvent);
  }

  sentEventsOfType(type: string) {
    return this.send.mock.calls
      .map(([event]) => JSON.parse(String(event)) as { type?: string })
      .filter((event) => event.type === type);
  }
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
