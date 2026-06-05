import { describe, expect, it } from "vitest";
import {
  buildCorpusChordSets,
  buildWeightedCharacterNgrams,
  parseNorvigNgrams,
  parseNorvigWordCounts,
  parseRussianFrequencyRows,
} from "./corpusGenerator";

describe("keyboard corpus chord generator", () => {
  it("parses Norvig ngram rows by total frequency and excludes complete words", () => {
    const ngrams = parseNorvigNgrams(
      [
        "2-gram\t*/*\t1/*",
        "TH\t100\t40",
        "HE\t90\t30",
        "TO\t80\t20",
        "3-gram\t*/*",
        "ING\t70",
        "THE\t60",
      ].join("\n"),
    );
    const completeWords = parseNorvigWordCounts(["the\t1000", "he\t800", "to\t700"].join("\n"));
    const sets = buildCorpusChordSets({
      englishNgrams: ngrams,
      englishCompleteWords: completeWords,
      russianWords: [],
      setSize: 3,
    });

    const englishValues = sets.filter((set) => set.layout === "EN").flatMap((set) => set.chords);

    expect(englishValues).toContain("th");
    expect(englishValues).toContain("ing");
    expect(englishValues).not.toContain("he");
    expect(englishValues).not.toContain("to");
    expect(englishValues).not.toContain("the");
  });

  it("derives Russian character ngrams from weighted frequency rows and excludes full lemmas", () => {
    const words = parseRussianFrequencyRows(
      [
        "Lemma\tPoS\tFreq(ipm)\tR\tD\tDoc",
        "стол\ts\t120.0\t100\t90\t1000",
        "сказать\tv\t80.0\t100\t90\t1000",
        "она\tspro\t70.0\t100\t90\t1000",
      ].join("\n"),
    );

    const ngrams = buildWeightedCharacterNgrams({
      words,
      lengths: [2, 3, 4],
      completeWords: new Set(words.map((word) => word.value)),
      allowedPattern: /^[а-яё]+$/u,
    });

    expect(ngrams.map((ngram) => ngram.value)).toContain("ст");
    expect(ngrams.map((ngram) => ngram.value)).toContain("ска");
    expect(ngrams.map((ngram) => ngram.value)).not.toContain("она");
    expect(ngrams.map((ngram) => ngram.value)).not.toContain("стол");
  });

  it("generates stable set ids with enough unique corpus chords per set", () => {
    const englishNgrams = parseNorvigNgrams(
      [
        "2-gram\t*/*",
        "TH\t100",
        "ER\t99",
        "RE\t98",
        "ND\t97",
        "ST\t96",
        "3-gram\t*/*",
        "ING\t95",
        "ION\t94",
        "TIO\t93",
        "ENT\t92",
        "4-gram\t*/*",
        "TION\t91",
        "MENT\t90",
        "OULD\t89",
        "5-gram\t*/*",
        "ATION\t88",
        "EMENT\t87",
        "6-gram\t*/*",
        "ATIONS\t86",
        "EMENTS\t85",
      ].join("\n"),
    );
    const russianWords = parseRussianFrequencyRows(
      [
        "Lemma\tPoS\tFreq(ipm)\tR\tD\tDoc",
        "сторона\ts\t100\t100\t90\t1000",
        "сказать\tv\t99\t100\t90\t1000",
        "человек\ts\t98\t100\t90\t1000",
        "говорить\tv\t97\t100\t90\t1000",
        "работа\ts\t96\t100\t90\t1000",
        "учиться\tv\t95\t100\t90\t1000",
      ].join("\n"),
    );

    const sets = buildCorpusChordSets({
      englishNgrams,
      englishCompleteWords: new Set(["the"]),
      russianWords,
      setSize: 4,
    });

    expect(sets.map((set) => set.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    sets.forEach((set) => {
      expect(set.chords.length).toBeGreaterThanOrEqual(4);
      expect(new Set(set.chords).size).toBe(set.chords.length);
      expect(set.chords.every((chord) => chord.length >= 2 && chord.length <= 8)).toBe(true);
    });
  });
});
