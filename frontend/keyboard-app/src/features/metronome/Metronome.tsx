import { Bell, BellOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { maxMetronomeBpm, metronomeStepBpm, minMetronomeBpm } from "./metronomeTempo";

interface Props {
  label: string;
  tempoLabel: string;
  bpmUnit: string;
  suggestedBpm?: number | null;
}

function scheduleClick(ctx: AudioContext, time: number, accent: boolean) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.frequency.value = accent ? 880 : 620;
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.25, time + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
  oscillator.start(time);
  oscillator.stop(time + 0.06);
}

export function Metronome({ label, tempoLabel, bpmUnit, suggestedBpm = null }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [draggingTempo, setDraggingTempo] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const nextNoteRef = useRef(0);
  const beatRef = useRef(0);

  useEffect(() => {
    if (suggestedBpm == null || draggingTempo) {
      return;
    }

    setBpm(suggestedBpm);
  }, [draggingTempo, suggestedBpm]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const ctx = ctxRef.current;
    if (!ctx) {
      return undefined;
    }

    const secondsPerBeat = 60 / bpm;
    nextNoteRef.current = ctx.currentTime + 0.08;
    const tick = () => {
      while (nextNoteRef.current < ctx.currentTime + 0.1) {
        scheduleClick(ctx, nextNoteRef.current, beatRef.current % 2 === 0);
        nextNoteRef.current += secondsPerBeat;
        beatRef.current += 1;
      }
    };

    const timer = window.setInterval(tick, 25);
    return () => window.clearInterval(timer);
  }, [enabled, bpm]);

  const toggle = async () => {
    if (!enabled) {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) {
        return;
      }
      ctxRef.current ??= new Ctx();
      await ctxRef.current.resume();
      beatRef.current = 0;
    }
    setEnabled((value) => !value);
  };

  return (
    <div className="metronome">
      <button
        type="button"
        className={`icon-text-button ${enabled ? "is-on" : ""}`}
        onClick={() => void toggle()}
        aria-pressed={enabled}
        title={label}
      >
        {enabled ? <Bell size={18} aria-hidden="true" /> : <BellOff size={18} aria-hidden="true" />}
        <span>{label}</span>
      </button>
      <label className="metronome__slider">
        <span>{tempoLabel}</span>
        <input
          type="range"
          min={minMetronomeBpm}
          max={maxMetronomeBpm}
          step={metronomeStepBpm}
          value={bpm}
          onPointerDown={() => setDraggingTempo(true)}
          onPointerUp={() => setDraggingTempo(false)}
          onBlur={() => setDraggingTempo(false)}
          onChange={(event) => setBpm(Number(event.target.value))}
        />
        <strong>{`${bpm} ${bpmUnit}`}</strong>
      </label>
    </div>
  );
}
