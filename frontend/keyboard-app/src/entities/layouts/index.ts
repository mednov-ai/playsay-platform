import type { Finger, KeyDef, LayoutId } from "../../shared/types";

const FINGER_BY_CODE: Record<string, Finger> = {
  KeyQ: "leftPinky",
  KeyW: "leftRing",
  KeyE: "leftMiddle",
  KeyR: "leftIndex",
  KeyT: "leftIndex",
  KeyY: "rightIndex",
  KeyU: "rightIndex",
  KeyI: "rightMiddle",
  KeyO: "rightRing",
  KeyP: "rightPinky",
  BracketLeft: "rightPinky",
  BracketRight: "rightPinky",
  KeyA: "leftPinky",
  KeyS: "leftRing",
  KeyD: "leftMiddle",
  KeyF: "leftIndex",
  KeyG: "leftIndex",
  KeyH: "rightIndex",
  KeyJ: "rightIndex",
  KeyK: "rightMiddle",
  KeyL: "rightRing",
  Semicolon: "rightPinky",
  Quote: "rightPinky",
  KeyZ: "leftPinky",
  KeyX: "leftRing",
  KeyC: "leftMiddle",
  KeyV: "leftIndex",
  KeyB: "leftIndex",
  KeyN: "rightIndex",
  KeyM: "rightIndex",
  Comma: "rightMiddle",
  Period: "rightRing",
  Slash: "rightPinky",
};

const ROWS: string[][] = [
  ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight"],
  ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote"],
  ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"],
];

const CHARS: Record<LayoutId, Record<string, string>> = {
  EN: {
    KeyQ: "q",
    KeyW: "w",
    KeyE: "e",
    KeyR: "r",
    KeyT: "t",
    KeyY: "y",
    KeyU: "u",
    KeyI: "i",
    KeyO: "o",
    KeyP: "p",
    KeyA: "a",
    KeyS: "s",
    KeyD: "d",
    KeyF: "f",
    KeyG: "g",
    KeyH: "h",
    KeyJ: "j",
    KeyK: "k",
    KeyL: "l",
    KeyZ: "z",
    KeyX: "x",
    KeyC: "c",
    KeyV: "v",
    KeyB: "b",
    KeyN: "n",
    KeyM: "m",
  },
  RU: {
    KeyQ: "й",
    KeyW: "ц",
    KeyE: "у",
    KeyR: "к",
    KeyT: "е",
    KeyY: "н",
    KeyU: "г",
    KeyI: "ш",
    KeyO: "щ",
    KeyP: "з",
    BracketLeft: "х",
    BracketRight: "ъ",
    KeyA: "ф",
    KeyS: "ы",
    KeyD: "в",
    KeyF: "а",
    KeyG: "п",
    KeyH: "р",
    KeyJ: "о",
    KeyK: "л",
    KeyL: "д",
    Semicolon: "ж",
    Quote: "э",
    KeyZ: "я",
    KeyX: "ч",
    KeyC: "с",
    KeyV: "м",
    KeyB: "и",
    KeyN: "т",
    KeyM: "ь",
    Comma: "б",
    Period: "ю",
  },
};

export interface Layout {
  id: LayoutId;
  keys: KeyDef[];
  byCode: Record<string, KeyDef>;
  byChar: Record<string, KeyDef>;
}

function buildLayout(id: LayoutId): Layout {
  const keys: KeyDef[] = [];
  ROWS.forEach((rowCodes, row) => {
    let col = 0;
    for (const code of rowCodes) {
      const char = CHARS[id][code];
      if (!char) {
        continue;
      }
      keys.push({ code, char, finger: FINGER_BY_CODE[code], row, col });
      col += 1;
    }
  });

  const byCode: Record<string, KeyDef> = {};
  const byChar: Record<string, KeyDef> = {};
  keys.forEach((key) => {
    byCode[key.code] = key;
    byChar[key.char] = key;
  });
  return { id, keys, byCode, byChar };
}

export const LAYOUTS: Record<LayoutId, Layout> = {
  EN: buildLayout("EN"),
  RU: buildLayout("RU"),
};
