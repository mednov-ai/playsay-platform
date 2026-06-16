import { seededShuffle } from "../../shared/deterministic";
import type { ChordSet, PracticeContext } from "../../shared/types";

export type CodeLanguageId =
  | "python"
  | "javascript"
  | "typescript"
  | "java"
  | "kotlin"
  | "csharp"
  | "cplusplus"
  | "swift"
  | "go";

export type CodeDifficultyBand = "trigrams" | "quadgrams" | "long";

export interface CodeLanguageOption {
  id: CodeLanguageId;
  label: string;
}

export interface BuildCodeChordSetOptions {
  includeNumberRow?: boolean;
}

interface CodeBandConfig {
  id: CodeDifficultyBand;
  title: string;
  difficulty: number;
  lengths: number[];
  anchorId: number;
}

export const codeLanguageOptions: CodeLanguageOption[] = [
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "java", label: "Java" },
  { id: "kotlin", label: "Kotlin" },
  { id: "csharp", label: "C#" },
  { id: "cplusplus", label: "C++" },
  { id: "swift", label: "Swift" },
  { id: "go", label: "Go" },
];

export const codeDifficultyBands: CodeBandConfig[] = [
  { id: "trigrams", title: "Trigrams", difficulty: 7, lengths: [3], anchorId: 40 },
  { id: "quadgrams", title: "Quadgrams", difficulty: 8, lengths: [4], anchorId: 41 },
  { id: "long", title: "Long", difficulty: 9, lengths: [5, 6, 7, 8], anchorId: 42 },
];

const setSize = 64;
const numberRowChordQuota = 16;
const codePattern = /^[a-z0-9_+\-*/%=!<>{}()[\].,:;'"#?|&^~]+$/;
const digitPattern = /[0-9]/;

const codeSources: Record<CodeLanguageId, string[]> = {
  python: [
    "def(name):", "class(user):", "self.value", "__init__", "import(path)", "from(pkg)", "return(value)",
    "async:def", "await(call)", "range(len)", "data.get(key)", "items[i]", "list.append(x)", "dict[key]",
    "if(value):", "elif(err):", "else:", "try:", "except(err):", "with(open)", "lambda:x", "print(value)",
  ],
  javascript: [
    "function(name){", "const(value)=>{", "let(count)=0;", "array.map(x=>x.id)", "items?.[i]", "obj?.value",
    "return(null);", "import{use}", "export{app}", "await(fetch())", "async()=>{}", "promise.then(fn)",
    "if(value){", "}else{", "for(i=0;i<n;i++)", "while(ok){", "JSON.parse(x)", "console.log(x)",
  ],
  typescript: [
    "interface<Props>{", "type<User>=Record", "const(item:User)=>", "value?:string", "readonly:id",
    "private:state", "public:run()", "implements<App>", "extends<Base>", "Promise<Result>", "Array<Item>",
    "keyof:type", "as:const", "satisfies<T>", "enum{ready}", "import{type}", "export:type",
  ],
  java: [
    "public:class", "private:int", "static:void", "String[]args", "new:Object()", "return:value;",
    "if(value){", "}else{", "for(int:i=0;i<n;i++)", "List<String>", "Map<Key,Value>", "Optional.of(x)",
    "@Override", "throws:error", "try{call();}", "catch(Exception)", "record(User)", "package:app",
  ],
  kotlin: [
    "fun main(){", "val name:String", "var count:Int", "data class User", "sealed interface", "object:State",
    "when(value){", "else->Unit", "list.map{it.id}", "suspend fun", "return value", "private val",
    "public fun", "String?", "Result<T>", "flow.collect{}", "companion object", "import app",
  ],
  csharp: [
    "public class", "private int", "static void", "string[]args", "new User()", "return value;",
    "if(value){", "}else{", "for(int i=0;i<n;i++)", "List<string>", "Dictionary<K,V>", "async Task",
    "await call()", "namespace App", "using System", "record User", "get;set;", "value?.Name", "items[i]",
  ],
  cplusplus: [
    "int main(){", "std::vector<int>", "std::string", "auto value", "const auto&", "return 0;",
    "if(value){", "}else{", "for(int i=0;i<n;i++)", "template<class T>", "namespace app", "#include<iostream>",
    "cout<<value", "ptr->field", "map[key]", "size_t", "unique_ptr<T>", "void run()",
  ],
  swift: [
    "func main(){", "let value:String", "var count:Int", "class User", "struct Model", "enum State",
    "guard let", "if value {", "} else {", "for item in list", "return value", "async throws",
    "await call()", "try? decode()", "String?", "Array<Item>", "Dictionary<Key,Value>", "self.value",
  ],
  go: [
    "func main(){", "package main", "import(fmt)", "var count int", "const name", "return value",
    "if err!=nil{", "}else{", "for i:=0;i<n;i++", "range items", "map[string]int", "struct{ID int}",
    "defer close()", "go func(){", "chan<-value", "select{case", "fmt.Println(x)", "context.Context",
  ],
};

const numberRowSources = [
  "0123456789",
  "9876543210",
  "00112233445566778899",
  "102030405060708090",
  "1234567890",
  "9081726354",
  "31415926",
  "27182818",
  "10111213",
];

export const codeChordSets: ChordSet[] = [
  ...codeDifficultyBands.flatMap((band, bandIndex) =>
    codeLanguageOptions.map((language, languageIndex) =>
      codeChordSet({
        id: 13 + bandIndex * codeLanguageOptions.length + languageIndex,
        title: `CODE · ${language.label} · ${band.title}`,
        languageIds: [language.id],
        difficultyBand: band.id,
        difficulty: band.difficulty,
        chords: prepareCodeChords(languageChords(language.id, band.id), band.id, `${language.id}:${band.id}`, false),
      }),
    ),
  ),
  ...codeDifficultyBands.map((band) =>
    codeChordSet({
      id: band.anchorId,
      title: `CODE · Mixed · ${band.title}`,
      languageIds: codeLanguageOptions.map((language) => language.id),
      difficultyBand: band.id,
      difficulty: band.difficulty,
      chords: prepareCodeChords(
        buildMixedChords(codeLanguageOptions.map((language) => language.id), band.id, `anchor:${band.id}`),
        band.id,
        `anchor:${band.id}`,
        false,
      ),
    }),
  ),
];

export function buildCombinedCodeChordSet(
  languageIds: CodeLanguageId[],
  difficultyBand: CodeDifficultyBand,
  options: BuildCodeChordSetOptions = {},
): ChordSet {
  const languages = normalizeLanguageIds(languageIds);
  const band = bandConfig(difficultyBand);
  const includeNumberRow = options.includeNumberRow === true;
  if (languages.length === 1) {
    const language = languageOption(languages[0]);
    const seed = `${language.id}:${difficultyBand}`;
    return codeChordSet({
      id: 13 + codeDifficultyBands.findIndex((candidate) => candidate.id === difficultyBand) * codeLanguageOptions.length + codeLanguageOptions.findIndex((candidate) => candidate.id === language.id),
      title: `CODE · ${language.label} · ${band.title}`,
      languageIds: [language.id],
      difficultyBand,
      difficulty: band.difficulty,
      includeNumberRow,
      chords: prepareCodeChords(languageChords(language.id, difficultyBand), difficultyBand, seed, includeNumberRow),
    });
  }

  const labels = languages.map((language) => languageOption(language).label);
  const title = `CODE · ${labels.join(" + ")} · ${band.title}`;
  const seed = `${difficultyBand}:${languages.join("+")}`;
  return codeChordSet({
    id: -2,
    sourceChordSetId: band.anchorId,
    title,
    languageIds: languages,
    difficultyBand,
    difficulty: band.difficulty,
    includeNumberRow,
    practiceKind: "CODE_COMBO",
    chords: prepareCodeChords(buildMixedChords(languages, difficultyBand, seed), difficultyBand, seed, includeNumberRow),
  });
}

export function codeDifficultyBandForSet(set: Pick<ChordSet, "difficulty" | "title">): CodeDifficultyBand | null {
  if (!set.title.startsWith("CODE · ")) {
    return null;
  }
  if (set.difficulty === 7) {
    return "trigrams";
  }
  if (set.difficulty === 8) {
    return "quadgrams";
  }
  return "long";
}

function codeChordSet(input: {
  id: number;
  sourceChordSetId?: number;
  title: string;
  languageIds: CodeLanguageId[];
  difficultyBand: CodeDifficultyBand;
  difficulty: number;
  chords: string[];
  includeNumberRow?: boolean;
  practiceKind?: "CODE" | "CODE_COMBO";
}): ChordSet {
  const practiceContext: PracticeContext = {
    practiceKind: input.practiceKind ?? "CODE",
    codeLanguages: input.languageIds,
    difficultyBand: input.difficultyBand,
    title: input.title,
    numberRowEnabled: input.includeNumberRow === true,
  };
  return {
    id: input.id,
    sourceChordSetId: input.sourceChordSetId,
    layout: "EN",
    title: input.title,
    difficulty: input.difficulty,
    tier: levelTierForDifficulty(input.difficulty),
    chords: input.chords.slice(0, setSize),
    practiceKind: input.practiceKind ?? "CODE",
    codeLanguages: input.languageIds,
    practiceContext,
  };
}

function languageChords(languageId: CodeLanguageId, difficultyBand: CodeDifficultyBand): string[] {
  const band = bandConfig(difficultyBand);
  return buildCodeNgrams(codeSources[languageId], band.lengths, `${languageId}:${difficultyBand}`);
}

function buildMixedChords(languageIds: CodeLanguageId[], difficultyBand: CodeDifficultyBand, seed: string): string[] {
  const pools = languageIds.map((language) => languageChords(language, difficultyBand));
  const mixed: string[] = [];
  let index = 0;
  while (mixed.length < setSize && pools.some((pool) => index < pool.length)) {
    pools.forEach((pool) => {
      const chord = pool[index];
      if (chord && !mixed.includes(chord)) {
        mixed.push(chord);
      }
    });
    index += 1;
  }
  return seededShuffle(mixed, seed).slice(0, setSize);
}

function prepareCodeChords(
  chords: string[],
  difficultyBand: CodeDifficultyBand,
  seed: string,
  includeNumberRow: boolean,
): string[] {
  const codeChords = chords.filter(withoutDigits);
  if (!includeNumberRow) {
    return codeChords.slice(0, setSize);
  }

  const digitChords = seededShuffle(numberRowChords(difficultyBand), `${seed}:number-row`)
    .filter((chord) => /^[0-9]+$/.test(chord))
    .slice(0, numberRowChordQuota);
  const codeQuota = Math.max(0, setSize - digitChords.length);
  return seededShuffle(unique([...codeChords.slice(0, codeQuota), ...digitChords]), `${seed}:number-row-enabled`).slice(0, setSize);
}

function numberRowChords(difficultyBand: CodeDifficultyBand): string[] {
  const band = bandConfig(difficultyBand);
  return buildCodeNgrams(numberRowSources, band.lengths, `number-row:${difficultyBand}`);
}

function withoutDigits(chord: string): boolean {
  return !digitPattern.test(chord);
}

function buildCodeNgrams(source: string[], lengths: number[], seed: string): string[] {
  const primary = collectCodeNgrams(source, lengths);
  const fallback = collectCodeNgrams(source, [3, 4, 5, 6, 7, 8]);
  return seededShuffle(unique([...primary, ...fallback]), seed).slice(0, setSize);
}

function collectCodeNgrams(source: string[], lengths: number[]): string[] {
  const wanted = new Set(lengths);
  const values: string[] = [];
  normalizedSegments(source).forEach((segment) => {
    wanted.forEach((length) => {
      if (segment.length < length) {
        return;
      }
      if (segment.length === length) {
        values.push(segment);
      }
      for (let start = 0; start <= segment.length - length; start += 1) {
        values.push(segment.slice(start, start + length));
      }
    });
  });
  return unique(values.filter((value) => value.length >= 3 && value.length <= 8 && codePattern.test(value)));
}

function normalizedSegments(source: string[]): string[] {
  return source
    .flatMap((sample) => sample.toLowerCase().split(/\s+/))
    .map((sample) => sample.replace(/[^a-z0-9_+\-*/%=!<>{}()[\].,:;'"#?|&^~]/g, ""))
    .filter((sample) => sample.length >= 3 && codePattern.test(sample));
}

function normalizeLanguageIds(languageIds: CodeLanguageId[]): CodeLanguageId[] {
  const selected = new Set(languageIds);
  const normalized = codeLanguageOptions
    .map((language) => language.id)
    .filter((language) => selected.has(language));
  return normalized.length > 0 ? normalized : ["python"];
}

function languageOption(languageId: CodeLanguageId): CodeLanguageOption {
  return codeLanguageOptions.find((language) => language.id === languageId) ?? codeLanguageOptions[0];
}

function bandConfig(difficultyBand: CodeDifficultyBand): CodeBandConfig {
  return codeDifficultyBands.find((band) => band.id === difficultyBand) ?? codeDifficultyBands[0];
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    result.push(value);
  });
  return result;
}

function levelTierForDifficulty(difficulty: number): ChordSet["tier"] {
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
