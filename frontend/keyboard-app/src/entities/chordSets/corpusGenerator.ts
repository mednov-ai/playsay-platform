import type { LayoutId } from "../../shared/types";

export interface CorpusNgram {
  value: string;
  count: number;
}

export interface WeightedWord {
  value: string;
  weight: number;
}

export interface CorpusChordSet {
  id: number;
  layout: LayoutId;
  title: string;
  difficulty: number;
  chords: string[];
}

export interface BuildWeightedCharacterNgramsInput {
  words: WeightedWord[];
  lengths: number[];
  completeWords: ReadonlySet<string>;
  allowedPattern: RegExp;
}

export interface BuildCorpusChordSetsInput {
  englishNgrams: CorpusNgram[];
  englishCompleteWords: ReadonlySet<string>;
  russianWords: WeightedWord[];
  setSize?: number;
}

const defaultSetSize = 64;
const englishPattern = /^[a-z]+$/;
const russianPattern = /^[а-я]+$/u;

const setConfigs: Array<Omit<CorpusChordSet, "chords"> & { lengths: number[] }> = [
  { id: 1, layout: "EN", title: "EN · Bigrams I (home keys)", difficulty: 1, lengths: [2] },
  { id: 2, layout: "EN", title: "EN · Bigrams II", difficulty: 2, lengths: [2, 3] },
  { id: 3, layout: "EN", title: "EN · Trigrams", difficulty: 3, lengths: [3] },
  { id: 4, layout: "EN", title: "EN · Quadgrams", difficulty: 4, lengths: [4] },
  { id: 5, layout: "RU", title: "RU · Биграммы I", difficulty: 1, lengths: [2] },
  { id: 6, layout: "RU", title: "RU · Биграммы II", difficulty: 2, lengths: [2, 3] },
  { id: 7, layout: "RU", title: "RU · Триграммы", difficulty: 3, lengths: [3] },
  { id: 8, layout: "RU", title: "RU · Четырёхграммы", difficulty: 4, lengths: [4] },
  { id: 9, layout: "EN", title: "EN · Длинные I", difficulty: 5, lengths: [4, 5] },
  { id: 10, layout: "EN", title: "EN · Длинные II", difficulty: 6, lengths: [5, 6, 7, 8] },
  { id: 11, layout: "RU", title: "RU · Длинные I", difficulty: 5, lengths: [4, 5] },
  { id: 12, layout: "RU", title: "RU · Длинные II", difficulty: 6, lengths: [5, 6, 7, 8] },
];

export function parseNorvigNgrams(tsv: string): CorpusNgram[] {
  return tsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawValue, rawTotal] = line.split("\t");
      const value = rawValue?.trim().toLowerCase() ?? "";
      const count = Number(rawTotal);
      return { value, count };
    })
    .filter((ngram) => ngram.value.length >= 2 && ngram.value.length <= 8)
    .filter((ngram) => englishPattern.test(ngram.value))
    .filter((ngram) => Number.isFinite(ngram.count) && ngram.count > 0)
    .sort(compareByCountThenValue);
}

export function parseNorvigWordCounts(text: string, minimumCount = 0): Set<string> {
  return new Set(
    text
      .split(/\r?\n/)
      .map((line) => {
        const [rawWord, rawCount] = line.trim().split(/\s+/);
        return {
          word: rawWord?.toLowerCase() ?? "",
          count: Number(rawCount),
        };
      })
      .filter(({ word }) => englishPattern.test(word))
      .filter(({ count }) => minimumCount <= 0 || (Number.isFinite(count) && count >= minimumCount))
      .map(({ word }) => word),
  );
}

export function parseRussianFrequencyRows(tsv: string): WeightedWord[] {
  return tsv
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawLemma, , rawFrequency] = line.split("\t");
      return {
        value: normalizeRussianWord(rawLemma ?? ""),
        weight: Number(rawFrequency),
      };
    })
    .filter((word) => word.value.length >= 2)
    .filter((word) => russianPattern.test(word.value))
    .filter((word) => Number.isFinite(word.weight) && word.weight > 0);
}

export function buildWeightedCharacterNgrams({
  words,
  lengths,
  completeWords,
  allowedPattern,
}: BuildWeightedCharacterNgramsInput): CorpusNgram[] {
  const wantedLengths = new Set(lengths);
  const counts = new Map<string, number>();

  words.forEach((word) => {
    const chars = Array.from(word.value);
    wantedLengths.forEach((length) => {
      if (length < 2 || chars.length < length) {
        return;
      }
      for (let start = 0; start <= chars.length - length; start += 1) {
        const value = chars.slice(start, start + length).join("");
        if (!allowedPattern.test(value) || completeWords.has(value)) {
          continue;
        }
        counts.set(value, (counts.get(value) ?? 0) + word.weight);
      }
    });
  });

  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort(compareByCountThenValue);
}

export function buildCorpusChordSets({
  englishNgrams,
  englishCompleteWords,
  russianWords,
  setSize = defaultSetSize,
}: BuildCorpusChordSetsInput): CorpusChordSet[] {
  const cleanSetSize = Math.max(1, Math.floor(setSize));
  const englishCandidates = uniqueNgrams(
    englishNgrams
      .filter((ngram) => !englishCompleteWords.has(ngram.value))
      .filter((ngram) => ngram.value.length >= 2 && ngram.value.length <= 8)
      .filter((ngram) => englishPattern.test(ngram.value)),
  );
  const russianCompleteWords = new Set(russianWords.map((word) => word.value));
  const russianCandidates = buildWeightedCharacterNgrams({
    words: russianWords,
    lengths: [2, 3, 4, 5, 6, 7, 8],
    completeWords: russianCompleteWords,
    allowedPattern: russianPattern,
  });

  return setConfigs.map(({ lengths, ...config }) => {
    const candidates = config.layout === "EN" ? englishCandidates : russianCandidates;
    const primary = candidates.filter((candidate) => lengths.includes(candidate.value.length));
    const fallback = candidates.filter((candidate) => !lengths.includes(candidate.value.length));
    return {
      ...config,
      chords: uniqueValues([...primary, ...fallback]).slice(0, cleanSetSize),
    };
  });
}

function uniqueNgrams(ngrams: CorpusNgram[]): CorpusNgram[] {
  const seen = new Set<string>();
  const result: CorpusNgram[] = [];
  ngrams.forEach((ngram) => {
    if (seen.has(ngram.value)) {
      return;
    }
    seen.add(ngram.value);
    result.push(ngram);
  });
  return result;
}

function uniqueValues(ngrams: CorpusNgram[]): string[] {
  return uniqueNgrams(ngrams).map((ngram) => ngram.value);
}

function compareByCountThenValue(left: CorpusNgram, right: CorpusNgram): number {
  if (right.count !== left.count) {
    return right.count - left.count;
  }
  return left.value.localeCompare(right.value);
}

function normalizeRussianWord(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[ёЁ]/gu, "е");
}
