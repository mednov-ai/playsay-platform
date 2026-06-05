import type { ChordSet, LayoutId } from "../../shared/types";

export const localChordSets: ChordSet[] = [
  { id: 1, layout: "EN", title: "EN · Bigrams I (home keys)", difficulty: 1, chords: ["th", "er", "re", "nd", "st", "se", "le", "al", "ar", "te", "ed", "ng", "ti", "en", "es"] },
  { id: 2, layout: "EN", title: "EN · Bigrams II", difficulty: 2, chords: ["ha", "ou", "io", "ve", "co", "de", "hi", "ri", "ro", "ic", "ne", "ea", "ra", "ce", "li", "ch", "ll", "ma", "si", "om", "ur", "nt"] },
  { id: 3, layout: "EN", title: "EN · Trigrams", difficulty: 3, chords: ["ing", "ion", "tio", "ent", "ati", "ter", "tha", "res", "ver", "ons", "nce", "ith", "ted", "ers", "thi", "ect", "rea", "com", "int", "est", "sta", "cti", "ica", "ist", "ain", "iti"] },
  { id: 4, layout: "EN", title: "EN · Quadgrams", difficulty: 4, chords: ["tion", "atio", "ther", "ment", "ould", "ical", "ions", "ance", "ence", "ngth", "ight", "ttle", "sion", "ound"] },
  { id: 5, layout: "RU", title: "RU · Биграммы I", difficulty: 1, chords: ["ст", "ен", "ни", "ра", "ко", "ка", "ро", "ов", "го", "ор", "ли", "ал", "ер", "пр", "ре", "ва"] },
  { id: 6, layout: "RU", title: "RU · Биграммы II", difficulty: 2, chords: ["ос", "та", "ан", "ло", "ри", "ес", "ом", "ел", "ет", "ой", "ит", "ть", "ну", "тр", "ск", "ил", "ир"] },
  { id: 7, layout: "RU", title: "RU · Триграммы", difficulty: 3, chords: ["ост", "ени", "ого", "ние", "ств", "ани", "тор", "ско", "тел", "ова", "ало", "сто", "тся", "ест", "ред", "при", "чес", "тра", "нич"] },
  { id: 8, layout: "RU", title: "RU · Четырёхграммы", difficulty: 4, chords: ["ость", "ение", "ного", "ства", "тель", "ован", "ался", "ться", "ация", "енно", "ствен", "ально"] },
  { id: 9, layout: "EN", title: "EN · Длинные I", difficulty: 5, chords: ["atio", "tion", "ther", "ment", "ould", "ight", "ound", "ence", "ance", "ical", "sion", "ttle", "ngth", "stra", "ster", "ient"] },
  { id: 10, layout: "EN", title: "EN · Длинные II", difficulty: 6, chords: ["ation", "ition", "ement", "ently", "ssion", "iness", "ously", "ction", "tinue", "sider", "struct", "ntial"] },
  { id: 11, layout: "RU", title: "RU · Длинные I", difficulty: 5, chords: ["ость", "ение", "ного", "ства", "тель", "ован", "ться", "ация", "енно", "ально", "ствен", "ирова", "еског", "ателн"] },
  { id: 12, layout: "RU", title: "RU · Длинные II", difficulty: 6, chords: ["ование", "ительн", "ательн", "ственн", "оторый", "ирован", "еского", "остями", "ивание", "енного"] },
];

export function getLocalChordSets(layout: LayoutId, difficulty?: number): ChordSet[] {
  return localChordSets.filter((set) => set.layout === layout && (difficulty == null || set.difficulty === difficulty));
}
