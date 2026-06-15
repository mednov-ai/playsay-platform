import { seededShuffle } from "../../shared/deterministic";
import type { ChordSet, LayoutId, LevelTier } from "../../shared/types";
import {
  buildCombinedCodeChordSet,
  codeChordSets,
  codeDifficultyBandForSet,
  codeDifficultyBands,
  codeLanguageOptions,
  type CodeDifficultyBand,
  type CodeLanguageId,
} from "./codeChordSets";
import { corpusChordSets } from "./corpusChordSets";

export const localChordSets: ChordSet[] = corpusChordSets.map((set) =>
  chordSet({
    id: set.id,
    layout: set.layout,
    title: set.title,
    difficulty: set.difficulty,
    chords: [...set.chords],
  }),
).concat(codeChordSets);

export function getLocalChordSets(layout: LayoutId, difficulty?: number): ChordSet[] {
  return localChordSets.filter((set) => set.layout === layout && (difficulty == null || set.difficulty === difficulty));
}

export function levelTierForDifficulty(difficulty: number): LevelTier {
  if (difficulty <= 2) {
    return "beginner";
  }
  if (difficulty === 3) {
    return "confident";
  }
  if (difficulty <= 5) {
    return "middle";
  }
  return "professional";
}

export function orderChordSetChords(
  chordSet: ChordSet,
  profileSeed: string,
  sessionNumber: number,
  restartVariant = 0,
): string[] {
  return seededShuffle(chordSet.chords, `${profileSeed}:${chordSet.id}:${sessionNumber}:${restartVariant}`);
}

export function materializeChordSet(
  chordSet: ChordSet,
  profileSeed: string,
  sessionNumber: number,
  restartVariant = 0,
): ChordSet {
  return {
    ...chordSet,
    chords: orderChordSetChords(chordSet, profileSeed, sessionNumber, restartVariant),
  };
}

function chordSet(input: Omit<ChordSet, "tier">): ChordSet {
  return {
    ...input,
    practiceKind: input.practiceKind ?? "LETTER",
    tier: levelTierForDifficulty(input.difficulty),
  };
}

export {
  buildCombinedCodeChordSet,
  codeDifficultyBandForSet,
  codeDifficultyBands,
  codeLanguageOptions,
  type CodeDifficultyBand,
  type CodeLanguageId,
};
