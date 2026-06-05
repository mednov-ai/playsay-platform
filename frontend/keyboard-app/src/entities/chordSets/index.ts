import { seededShuffle } from "../../shared/deterministic";
import type { ChordSet, LayoutId, LevelTier } from "../../shared/types";

export const localChordSets: ChordSet[] = [
  chordSet({ id: 1, layout: "EN", title: "EN · Bigrams I (home keys)", difficulty: 1, chords: ["th", "er", "re", "nd", "st", "se", "le", "al", "ar", "te", "ed", "ng", "ti", "en", "es", "he", "in", "an", "on", "to", "ou", "is", "it", "or", "as", "at", "hi", "ha", "ea", "ve", "co", "me"] }),
  chordSet({ id: 2, layout: "EN", title: "EN · Bigrams II", difficulty: 2, chords: ["ha", "ou", "io", "ve", "co", "de", "hi", "ri", "ro", "ic", "ne", "ea", "ra", "ce", "li", "ch", "ll", "ma", "si", "om", "ur", "nt", "wh", "qu", "ck", "sh", "ph", "gh", "ow", "ay", "oo", "ee"] }),
  chordSet({ id: 3, layout: "EN", title: "EN · Trigrams", difficulty: 3, chords: ["ing", "ion", "tio", "ent", "ati", "ter", "tha", "res", "ver", "ons", "nce", "ith", "ted", "ers", "thi", "ect", "rea", "com", "int", "est", "sta", "cti", "ica", "ist", "ain", "iti", "you", "and", "for", "not", "but", "all"] }),
  chordSet({ id: 4, layout: "EN", title: "EN · Quadgrams", difficulty: 4, chords: ["tion", "atio", "ther", "ment", "ould", "ical", "ions", "ance", "ence", "ngth", "ight", "ttle", "sion", "ound", "ever", "have", "with", "from", "ally", "less", "able", "king"] }),
  chordSet({ id: 5, layout: "RU", title: "RU · Биграммы I", difficulty: 1, chords: ["ст", "ен", "ни", "ра", "ко", "ка", "ро", "ов", "го", "ор", "ли", "ал", "ер", "пр", "ре", "ва", "но", "на", "по", "то", "ел", "от", "ос", "та", "ла", "де", "ол", "ть", "ес", "ом", "ит", "ан"] }),
  chordSet({ id: 6, layout: "RU", title: "RU · Биграммы II", difficulty: 2, chords: ["ос", "та", "ан", "ло", "ри", "ес", "ом", "ел", "ет", "ой", "ит", "ть", "ну", "тр", "ск", "ил", "ир", "ть", "же", "за", "вы", "им", "ся", "чт", "до", "из", "сл", "ые", "ей", "ль"] }),
  chordSet({ id: 7, layout: "RU", title: "RU · Триграммы", difficulty: 3, chords: ["ост", "ени", "ого", "ние", "ств", "ани", "тор", "ско", "тел", "ова", "ало", "сто", "тся", "ест", "ред", "при", "чес", "тра", "нич", "что", "как", "про", "под", "раз", "для", "она"] }),
  chordSet({ id: 8, layout: "RU", title: "RU · Четырёхграммы", difficulty: 4, chords: ["ость", "ение", "ного", "ства", "тель", "ован", "ался", "ться", "ация", "енно", "ствен", "ально", "кото", "пере", "пред", "сказ", "учен", "говор"] }),
  chordSet({ id: 9, layout: "EN", title: "EN · Длинные I", difficulty: 5, chords: ["atio", "tion", "ther", "ment", "ould", "ight", "ound", "ence", "ance", "ical", "sion", "ttle", "ngth", "stra", "ster", "ient", "rough", "under", "stand", "press"] }),
  chordSet({ id: 10, layout: "EN", title: "EN · Длинные II", difficulty: 6, chords: ["ation", "ition", "ement", "ently", "ssion", "iness", "ously", "ction", "tinue", "sider", "struct", "ntial", "fulness", "ability", "through", "practice"] }),
  chordSet({ id: 11, layout: "RU", title: "RU · Длинные I", difficulty: 5, chords: ["ость", "ение", "ного", "ства", "тель", "ован", "ться", "ация", "енно", "ально", "ствен", "ирова", "еског", "ателн", "учени", "говор", "котор", "поним"] }),
  chordSet({ id: 12, layout: "RU", title: "RU · Длинные II", difficulty: 6, chords: ["ование", "ительн", "ательн", "ственн", "оторый", "ирован", "еского", "остями", "ивание", "енного", "практик", "скорост", "вниман"] }),
];

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

export function orderChordSetChords(chordSet: ChordSet, profileSeed: string, sessionNumber: number): string[] {
  const head = chordSet.chords.slice(0, 5);
  const tail = seededShuffle(chordSet.chords.slice(5), `${profileSeed}:${chordSet.id}:${sessionNumber}`);
  return [...head, ...tail];
}

export function materializeChordSet(chordSet: ChordSet, profileSeed: string, sessionNumber: number): ChordSet {
  return {
    ...chordSet,
    chords: orderChordSetChords(chordSet, profileSeed, sessionNumber),
  };
}

function chordSet(input: Omit<ChordSet, "tier">): ChordSet {
  return {
    ...input,
    tier: levelTierForDifficulty(input.difficulty),
  };
}
