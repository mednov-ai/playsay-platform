export const minMetronomeBpm = 60;
export const maxMetronomeBpm = 300;
export const metronomeStepBpm = 5;
export const metronomeStableCadenceThreshold = 0.65;
export const minimumTempoIntervals = 3;

export function suggestMetronomeBpm(intervals: number[], cadence: number): number | null {
  if (cadence <= metronomeStableCadenceThreshold || intervals.length < minimumTempoIntervals) {
    return null;
  }

  const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  if (!Number.isFinite(averageInterval) || averageInterval <= 0) {
    return null;
  }

  const rawBpm = 60_000 / averageInterval;
  const roundedBpm = Math.round(rawBpm / metronomeStepBpm) * metronomeStepBpm;
  return Math.max(minMetronomeBpm, Math.min(maxMetronomeBpm, roundedBpm));
}
