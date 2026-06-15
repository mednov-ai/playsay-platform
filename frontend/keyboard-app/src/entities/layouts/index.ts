import type { Finger, KeyDef, LayoutId } from "../../shared/types";

const FINGER_BY_CODE: Record<string, Finger> = {
  Backquote: "leftPinky",
  Digit1: "leftPinky",
  Digit2: "leftRing",
  Digit3: "leftMiddle",
  Digit4: "leftIndex",
  Digit5: "leftIndex",
  Digit6: "rightIndex",
  Digit7: "rightIndex",
  Digit8: "rightMiddle",
  Digit9: "rightRing",
  Digit0: "rightPinky",
  Minus: "rightPinky",
  Equal: "rightPinky",
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
  Backslash: "rightPinky",
};

const ROWS: string[][] = [
  ["Backquote", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"],
  ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight"],
  ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote", "Backslash"],
  ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"],
];

interface KeyChars {
  normal: string;
  shifted?: string;
}

const CHARS: Record<LayoutId, Record<string, KeyChars>> = {
  EN: {
    Backquote: { normal: "`", shifted: "~" },
    Digit1: { normal: "1", shifted: "!" },
    Digit2: { normal: "2", shifted: "@" },
    Digit3: { normal: "3", shifted: "#" },
    Digit4: { normal: "4", shifted: "$" },
    Digit5: { normal: "5", shifted: "%" },
    Digit6: { normal: "6", shifted: "^" },
    Digit7: { normal: "7", shifted: "&" },
    Digit8: { normal: "8", shifted: "*" },
    Digit9: { normal: "9", shifted: "(" },
    Digit0: { normal: "0", shifted: ")" },
    Minus: { normal: "-", shifted: "_" },
    Equal: { normal: "=", shifted: "+" },
    KeyQ: { normal: "q", shifted: "Q" },
    KeyW: { normal: "w", shifted: "W" },
    KeyE: { normal: "e", shifted: "E" },
    KeyR: { normal: "r", shifted: "R" },
    KeyT: { normal: "t", shifted: "T" },
    KeyY: { normal: "y", shifted: "Y" },
    KeyU: { normal: "u", shifted: "U" },
    KeyI: { normal: "i", shifted: "I" },
    KeyO: { normal: "o", shifted: "O" },
    KeyP: { normal: "p", shifted: "P" },
    BracketLeft: { normal: "[", shifted: "{" },
    BracketRight: { normal: "]", shifted: "}" },
    Backslash: { normal: "\\", shifted: "|" },
    KeyA: { normal: "a", shifted: "A" },
    KeyS: { normal: "s", shifted: "S" },
    KeyD: { normal: "d", shifted: "D" },
    KeyF: { normal: "f", shifted: "F" },
    KeyG: { normal: "g", shifted: "G" },
    KeyH: { normal: "h", shifted: "H" },
    KeyJ: { normal: "j", shifted: "J" },
    KeyK: { normal: "k", shifted: "K" },
    KeyL: { normal: "l", shifted: "L" },
    Semicolon: { normal: ";", shifted: ":" },
    Quote: { normal: "'", shifted: "\"" },
    KeyZ: { normal: "z", shifted: "Z" },
    KeyX: { normal: "x", shifted: "X" },
    KeyC: { normal: "c", shifted: "C" },
    KeyV: { normal: "v", shifted: "V" },
    KeyB: { normal: "b", shifted: "B" },
    KeyN: { normal: "n", shifted: "N" },
    KeyM: { normal: "m", shifted: "M" },
    Comma: { normal: ",", shifted: "<" },
    Period: { normal: ".", shifted: ">" },
    Slash: { normal: "/", shifted: "?" },
  },
  RU: {
    Backquote: { normal: "ё", shifted: "Ё" },
    Digit1: { normal: "1", shifted: "!" },
    Digit2: { normal: "2", shifted: "\"" },
    Digit3: { normal: "3", shifted: "№" },
    Digit4: { normal: "4", shifted: ";" },
    Digit5: { normal: "5", shifted: "%" },
    Digit6: { normal: "6", shifted: ":" },
    Digit7: { normal: "7", shifted: "?" },
    Digit8: { normal: "8", shifted: "*" },
    Digit9: { normal: "9", shifted: "(" },
    Digit0: { normal: "0", shifted: ")" },
    Minus: { normal: "-", shifted: "_" },
    Equal: { normal: "=", shifted: "+" },
    KeyQ: { normal: "й", shifted: "Й" },
    KeyW: { normal: "ц", shifted: "Ц" },
    KeyE: { normal: "у", shifted: "У" },
    KeyR: { normal: "к", shifted: "К" },
    KeyT: { normal: "е", shifted: "Е" },
    KeyY: { normal: "н", shifted: "Н" },
    KeyU: { normal: "г", shifted: "Г" },
    KeyI: { normal: "ш", shifted: "Ш" },
    KeyO: { normal: "щ", shifted: "Щ" },
    KeyP: { normal: "з", shifted: "З" },
    BracketLeft: { normal: "х", shifted: "Х" },
    BracketRight: { normal: "ъ", shifted: "Ъ" },
    Backslash: { normal: "\\", shifted: "/" },
    KeyA: { normal: "ф", shifted: "Ф" },
    KeyS: { normal: "ы", shifted: "Ы" },
    KeyD: { normal: "в", shifted: "В" },
    KeyF: { normal: "а", shifted: "А" },
    KeyG: { normal: "п", shifted: "П" },
    KeyH: { normal: "р", shifted: "Р" },
    KeyJ: { normal: "о", shifted: "О" },
    KeyK: { normal: "л", shifted: "Л" },
    KeyL: { normal: "д", shifted: "Д" },
    Semicolon: { normal: "ж", shifted: "Ж" },
    Quote: { normal: "э", shifted: "Э" },
    KeyZ: { normal: "я", shifted: "Я" },
    KeyX: { normal: "ч", shifted: "Ч" },
    KeyC: { normal: "с", shifted: "С" },
    KeyV: { normal: "м", shifted: "М" },
    KeyB: { normal: "и", shifted: "И" },
    KeyN: { normal: "т", shifted: "Т" },
    KeyM: { normal: "ь", shifted: "Ь" },
    Comma: { normal: "б", shifted: "Б" },
    Period: { normal: "ю", shifted: "Ю" },
    Slash: { normal: ".", shifted: "," },
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
      const chars = CHARS[id][code];
      if (!chars) {
        continue;
      }
      keys.push({
        code,
        char: chars.normal,
        shiftedChar: chars.shifted,
        requiresShift: false,
        finger: FINGER_BY_CODE[code],
        row,
        col,
      });
      col += 1;
    }
  });

  const byCode: Record<string, KeyDef> = {};
  const byChar: Record<string, KeyDef> = {};
  keys.forEach((key) => {
    byCode[key.code] = key;
    byChar[key.char] = key;
    if (key.shiftedChar) {
      byChar[key.shiftedChar] = {
        ...key,
        char: key.shiftedChar,
        requiresShift: true,
      };
    }
  });
  return { id, keys, byCode, byChar };
}

export const LAYOUTS: Record<LayoutId, Layout> = {
  EN: buildLayout("EN"),
  RU: buildLayout("RU"),
};

export function resolveKeyInput(layoutId: LayoutId, code: string, shiftKey = false): KeyDef | undefined {
  const key = LAYOUTS[layoutId].byCode[code];
  if (!key) {
    return undefined;
  }
  if (shiftKey && key.shiftedChar) {
    return {
      ...key,
      char: key.shiftedChar,
      requiresShift: true,
    };
  }
  return key;
}
