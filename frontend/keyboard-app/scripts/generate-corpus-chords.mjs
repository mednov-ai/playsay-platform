import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";

const englishNgramsUrl = "https://norvig.com/tsv/ngrams-all.tsv.zip";
const englishWordsUrl = "https://norvig.com/ngrams/count_1w.txt";
const russianFrequencyUrl = "http://dict.ruslang.ru/Freq2011.zip";
const setSize = 72;
const englishCompleteWordMinimumCount = 500_000_000;

const scriptDir = dirname(new URL(import.meta.url).pathname);
const platformRoot = resolve(scriptDir, "../../..");
const frontendOutputPath = resolve(platformRoot, "frontend/keyboard-app/src/entities/chordSets/corpusChordSets.ts");
const liquibaseCsvPath = resolve(platformRoot, "backend/keyboard-service/src/main/resources/db/changelog/data/keyboard-corpus-chords.csv");

const englishPattern = /^[a-z]+$/;
const russianPattern = /^[а-я]+$/u;

const setConfigs = [
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

async function main() {
  const workDir = mkdtempSync(resolve(tmpdir(), "playsay-key-corpus-"));
  const [englishNgramBuffer, englishWordsText, russianZipBuffer] = await Promise.all([
    downloadBuffer(englishNgramsUrl),
    downloadText(englishWordsUrl),
    downloadBuffer(russianFrequencyUrl),
  ]);

  const englishNgramText = decodeMaybeGzip(englishNgramBuffer);
  const russianFrequencyText = extractZipEntry(workDir, russianZipBuffer, "freqrnc2011.csv");
  const sets = buildCorpusChordSets({
    englishNgrams: parseNorvigNgrams(englishNgramText),
    englishCompleteWords: parseNorvigWordCounts(englishWordsText, englishCompleteWordMinimumCount),
    russianWords: parseRussianFrequencyRows(russianFrequencyText),
    setSize,
  });

  writeGeneratedTypescript(sets);
  writeLiquibaseCsv(sets);
  console.log(`Generated ${sets.reduce((sum, set) => sum + set.chords.length, 0)} keyboard chords.`);
}

async function downloadBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function downloadText(url) {
  return (await downloadBuffer(url)).toString("utf8");
}

function decodeMaybeGzip(buffer) {
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return gunzipSync(buffer).toString("utf8");
  }
  return buffer.toString("utf8");
}

function extractZipEntry(workDir, buffer, entryName) {
  const zipPath = resolve(workDir, "source.zip");
  writeFileSync(zipPath, buffer);
  const result = spawnSync("unzip", ["-p", zipPath, entryName], { encoding: "utf8" });
  if (result.status !== 0 && result.stdout.trim().length === 0) {
    throw new Error(`Failed to extract ${entryName}: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function parseNorvigNgrams(tsv) {
  return tsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawValue, rawTotal] = line.split("\t");
      return {
        value: (rawValue || "").trim().toLowerCase(),
        count: Number(rawTotal),
      };
    })
    .filter((ngram) => ngram.value.length >= 2 && ngram.value.length <= 8)
    .filter((ngram) => englishPattern.test(ngram.value))
    .filter((ngram) => Number.isFinite(ngram.count) && ngram.count > 0)
    .sort(compareByCountThenValue);
}

function parseNorvigWordCounts(text, minimumCount = 0) {
  return new Set(
    text
      .split(/\r?\n/)
      .map((line) => {
        const [rawWord, rawCount] = line.trim().split(/\s+/);
        return {
          word: (rawWord || "").toLowerCase(),
          count: Number(rawCount),
        };
      })
      .filter(({ word }) => englishPattern.test(word))
      .filter(({ count }) => minimumCount <= 0 || (Number.isFinite(count) && count >= minimumCount))
      .map(({ word }) => word),
  );
}

function parseRussianFrequencyRows(tsv) {
  return tsv
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawLemma, , rawFrequency] = line.split("\t");
      return {
        value: normalizeRussianWord(rawLemma || ""),
        weight: Number(rawFrequency),
      };
    })
    .filter((word) => word.value.length >= 2)
    .filter((word) => russianPattern.test(word.value))
    .filter((word) => Number.isFinite(word.weight) && word.weight > 0);
}

function buildWeightedCharacterNgrams({ words, lengths, completeWords, allowedPattern }) {
  const wantedLengths = new Set(lengths);
  const counts = new Map();
  for (const word of words) {
    const chars = Array.from(word.value);
    for (const length of wantedLengths) {
      if (length < 2 || chars.length < length) {
        continue;
      }
      for (let start = 0; start <= chars.length - length; start += 1) {
        const value = chars.slice(start, start + length).join("");
        if (!allowedPattern.test(value) || completeWords.has(value)) {
          continue;
        }
        counts.set(value, (counts.get(value) || 0) + word.weight);
      }
    }
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort(compareByCountThenValue);
}

function buildCorpusChordSets({ englishNgrams, englishCompleteWords, russianWords, setSize }) {
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
      chords: uniqueValues([...primary, ...fallback]).slice(0, setSize),
    };
  });
}

function writeGeneratedTypescript(sets) {
  const header = [
    "// Generated by scripts/generate-corpus-chords.mjs.",
    "// Sources: https://norvig.com/tsv/ngrams-all.tsv.zip, https://norvig.com/ngrams/count_1w.txt, http://dict.ruslang.ru/Freq2011.zip",
    "",
  ].join("\n");
  const body = `export const corpusChordSets = ${JSON.stringify(sets, null, 2)} as const;\n`;
  mkdirSync(dirname(frontendOutputPath), { recursive: true });
  writeFileSync(frontendOutputPath, `${header}${body}`, "utf8");
}

function writeLiquibaseCsv(sets) {
  const rows = ["chord_set_id,position,chord_value"];
  for (const set of sets) {
    set.chords.forEach((chord, position) => {
      rows.push(`${set.id},${position},${chord}`);
    });
  }
  mkdirSync(dirname(liquibaseCsvPath), { recursive: true });
  writeFileSync(liquibaseCsvPath, `${rows.join("\n")}\n`, "utf8");
}

function uniqueNgrams(ngrams) {
  const seen = new Set();
  const result = [];
  for (const ngram of ngrams) {
    if (seen.has(ngram.value)) {
      continue;
    }
    seen.add(ngram.value);
    result.push(ngram);
  }
  return result;
}

function uniqueValues(ngrams) {
  return uniqueNgrams(ngrams).map((ngram) => ngram.value);
}

function compareByCountThenValue(left, right) {
  if (right.count !== left.count) {
    return right.count - left.count;
  }
  return left.value.localeCompare(right.value);
}

function normalizeRussianWord(value) {
  return value.trim().toLowerCase().replaceAll("ё", "е").replaceAll("Ё", "е");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
