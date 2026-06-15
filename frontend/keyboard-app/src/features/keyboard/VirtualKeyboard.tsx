import { FINGER_COLOR, type Finger, type LayoutId } from "../../shared/types";
import type { CSSProperties } from "react";

interface CharKey {
  code: string;
  en: string;
  ru: string;
  shiftedEn?: string;
  shiftedRu?: string;
  finger?: Finger;
  width?: number;
}

interface SpecialKey {
  labelKey: keyof KeyboardLabels;
  width: number;
  special: true;
  finger?: Finger;
  space?: boolean;
  shift?: boolean;
}

type Key = CharKey | SpecialKey;

export type KeyboardLabels = {
  backspace: string;
  tab: string;
  caps: string;
  enter: string;
  shift: string;
  control: string;
  alt: string;
  space: string;
};

const isSpecial = (key: Key): key is SpecialKey => (key as SpecialKey).special === true;
const homeKeyChars = new Set(["a", "s", "d", "f", "j", "k", "l", ";"]);

const rows: Key[][] = [
  [
    { code: "Backquote", en: "`", ru: "ё", shiftedEn: "~", shiftedRu: "Ё", finger: "leftPinky" },
    { code: "Digit1", en: "1", ru: "1", shiftedEn: "!", shiftedRu: "!", finger: "leftPinky" },
    { code: "Digit2", en: "2", ru: "2", shiftedEn: "@", shiftedRu: "\"", finger: "leftRing" },
    { code: "Digit3", en: "3", ru: "3", shiftedEn: "#", shiftedRu: "№", finger: "leftMiddle" },
    { code: "Digit4", en: "4", ru: "4", shiftedEn: "$", shiftedRu: ";", finger: "leftIndex" },
    { code: "Digit5", en: "5", ru: "5", shiftedEn: "%", shiftedRu: "%", finger: "leftIndex" },
    { code: "Digit6", en: "6", ru: "6", shiftedEn: "^", shiftedRu: ":", finger: "rightIndex" },
    { code: "Digit7", en: "7", ru: "7", shiftedEn: "&", shiftedRu: "?", finger: "rightIndex" },
    { code: "Digit8", en: "8", ru: "8", shiftedEn: "*", shiftedRu: "*", finger: "rightMiddle" },
    { code: "Digit9", en: "9", ru: "9", shiftedEn: "(", shiftedRu: "(", finger: "rightRing" },
    { code: "Digit0", en: "0", ru: "0", shiftedEn: ")", shiftedRu: ")", finger: "rightPinky" },
    { code: "Minus", en: "-", ru: "-", shiftedEn: "_", shiftedRu: "_", finger: "rightPinky" },
    { code: "Equal", en: "=", ru: "=", shiftedEn: "+", shiftedRu: "+", finger: "rightPinky" },
    { labelKey: "backspace", width: 2, special: true, finger: "rightPinky" },
  ],
  [
    { labelKey: "tab", width: 1.5, special: true, finger: "leftPinky" },
    { code: "KeyQ", en: "q", ru: "й", shiftedEn: "Q", shiftedRu: "Й", finger: "leftPinky" },
    { code: "KeyW", en: "w", ru: "ц", shiftedEn: "W", shiftedRu: "Ц", finger: "leftRing" },
    { code: "KeyE", en: "e", ru: "у", shiftedEn: "E", shiftedRu: "У", finger: "leftMiddle" },
    { code: "KeyR", en: "r", ru: "к", shiftedEn: "R", shiftedRu: "К", finger: "leftIndex" },
    { code: "KeyT", en: "t", ru: "е", shiftedEn: "T", shiftedRu: "Е", finger: "leftIndex" },
    { code: "KeyY", en: "y", ru: "н", shiftedEn: "Y", shiftedRu: "Н", finger: "rightIndex" },
    { code: "KeyU", en: "u", ru: "г", shiftedEn: "U", shiftedRu: "Г", finger: "rightIndex" },
    { code: "KeyI", en: "i", ru: "ш", shiftedEn: "I", shiftedRu: "Ш", finger: "rightMiddle" },
    { code: "KeyO", en: "o", ru: "щ", shiftedEn: "O", shiftedRu: "Щ", finger: "rightRing" },
    { code: "KeyP", en: "p", ru: "з", shiftedEn: "P", shiftedRu: "З", finger: "rightPinky" },
    { code: "BracketLeft", en: "[", ru: "х", shiftedEn: "{", shiftedRu: "Х", finger: "rightPinky" },
    { code: "BracketRight", en: "]", ru: "ъ", shiftedEn: "}", shiftedRu: "Ъ", finger: "rightPinky" },
    { code: "Backslash", en: "\\", ru: "\\", shiftedEn: "|", shiftedRu: "/", width: 1.5, finger: "rightPinky" },
  ],
  [
    { labelKey: "caps", width: 1.75, special: true, finger: "leftPinky" },
    { code: "KeyA", en: "a", ru: "ф", shiftedEn: "A", shiftedRu: "Ф", finger: "leftPinky" },
    { code: "KeyS", en: "s", ru: "ы", shiftedEn: "S", shiftedRu: "Ы", finger: "leftRing" },
    { code: "KeyD", en: "d", ru: "в", shiftedEn: "D", shiftedRu: "В", finger: "leftMiddle" },
    { code: "KeyF", en: "f", ru: "а", shiftedEn: "F", shiftedRu: "А", finger: "leftIndex" },
    { code: "KeyG", en: "g", ru: "п", shiftedEn: "G", shiftedRu: "П", finger: "leftIndex" },
    { code: "KeyH", en: "h", ru: "р", shiftedEn: "H", shiftedRu: "Р", finger: "rightIndex" },
    { code: "KeyJ", en: "j", ru: "о", shiftedEn: "J", shiftedRu: "О", finger: "rightIndex" },
    { code: "KeyK", en: "k", ru: "л", shiftedEn: "K", shiftedRu: "Л", finger: "rightMiddle" },
    { code: "KeyL", en: "l", ru: "д", shiftedEn: "L", shiftedRu: "Д", finger: "rightRing" },
    { code: "Semicolon", en: ";", ru: "ж", shiftedEn: ":", shiftedRu: "Ж", finger: "rightPinky" },
    { code: "Quote", en: "'", ru: "э", shiftedEn: "\"", shiftedRu: "Э", finger: "rightPinky" },
    { labelKey: "enter", width: 2.25, special: true, finger: "rightPinky" },
  ],
  [
    { labelKey: "shift", width: 2.25, special: true, finger: "leftPinky", shift: true },
    { code: "KeyZ", en: "z", ru: "я", shiftedEn: "Z", shiftedRu: "Я", finger: "leftPinky" },
    { code: "KeyX", en: "x", ru: "ч", shiftedEn: "X", shiftedRu: "Ч", finger: "leftRing" },
    { code: "KeyC", en: "c", ru: "с", shiftedEn: "C", shiftedRu: "С", finger: "leftMiddle" },
    { code: "KeyV", en: "v", ru: "м", shiftedEn: "V", shiftedRu: "М", finger: "leftIndex" },
    { code: "KeyB", en: "b", ru: "и", shiftedEn: "B", shiftedRu: "И", finger: "leftIndex" },
    { code: "KeyN", en: "n", ru: "т", shiftedEn: "N", shiftedRu: "Т", finger: "rightIndex" },
    { code: "KeyM", en: "m", ru: "ь", shiftedEn: "M", shiftedRu: "Ь", finger: "rightIndex" },
    { code: "Comma", en: ",", ru: "б", shiftedEn: "<", shiftedRu: "Б", finger: "rightMiddle" },
    { code: "Period", en: ".", ru: "ю", shiftedEn: ">", shiftedRu: "Ю", finger: "rightRing" },
    { code: "Slash", en: "/", ru: ".", shiftedEn: "?", shiftedRu: ",", finger: "rightPinky" },
    { labelKey: "shift", width: 2.75, special: true, finger: "rightPinky", shift: true },
  ],
  [
    { labelKey: "control", width: 1.4, special: true, finger: "leftPinky" },
    { labelKey: "alt", width: 1.4, special: true },
    { labelKey: "space", width: 7, special: true, space: true },
    { labelKey: "alt", width: 1.4, special: true },
    { labelKey: "control", width: 1.4, special: true, finger: "rightPinky" },
  ],
];

interface Props {
  labels: KeyboardLabels;
  layoutId: LayoutId;
  nextChar: string | null;
  nextRequiresShift?: boolean;
  programmingMode?: boolean;
  shiftActive?: boolean;
}

export function VirtualKeyboard({
  labels,
  layoutId,
  nextChar,
  nextRequiresShift = false,
  programmingMode = false,
  shiftActive = false,
}: Props) {
  const showShiftLayer = programmingMode || shiftActive || nextRequiresShift;
  return (
    <div
      className={`virtual-keyboard ${programmingMode ? "virtual-keyboard--programming" : ""} ${shiftActive ? "virtual-keyboard--shift-active" : ""} ${nextRequiresShift ? "virtual-keyboard--shift-target" : ""}`}
      aria-hidden="true"
    >
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="virtual-keyboard__row">
          {row.map((key, keyIndex) => {
            const width = key.width ?? 1;
            const color = key.finger ? FINGER_COLOR[key.finger] : undefined;
            const style = {
              "--key-width": String(width),
              "--finger-color": color ?? "var(--key-border)",
            } as CSSProperties;

            if (isSpecial(key)) {
              const active = (key.space === true && nextChar === " ") || (key.shift === true && (shiftActive || nextRequiresShift));
              return (
                <div
                  key={`${rowIndex}-${keyIndex}`}
                  className={`virtual-keyboard__key virtual-keyboard__key--special ${key.shift ? "virtual-keyboard__key--shift" : ""} ${active ? "is-active" : ""}`}
                  style={style}
                >
                  {key.space ? "" : labels[key.labelKey]}
                </div>
              );
            }

            const char = layoutId === "RU" ? key.ru : key.en;
            const shiftedChar = layoutId === "RU" ? key.shiftedRu : key.shiftedEn;
            const active = nextChar != null && (char === nextChar || shiftedChar === nextChar);
            const shiftTarget = nextRequiresShift && shiftedChar === nextChar;
            const homeKey = homeKeyChars.has(key.en);
            return (
              <div
                key={`${rowIndex}-${keyIndex}`}
                className={`virtual-keyboard__key ${active ? "is-active" : ""} ${shiftTarget ? "is-shift-target" : ""} ${homeKey ? "is-home-key" : ""}`}
                data-home-key={homeKey ? "true" : undefined}
                data-home-char={homeKey ? key.en : undefined}
                style={style}
              >
                <span className="virtual-keyboard__base">{formatKeyLabel(char)}</span>
                {showShiftLayer && shiftedChar ? (
                  <span className="virtual-keyboard__shifted">{formatKeyLabel(shiftedChar)}</span>
                ) : null}
                {homeKey ? <span className="virtual-keyboard__home-pad" aria-hidden="true" /> : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function formatKeyLabel(char: string): string {
  return /\p{L}/u.test(char) ? char.toUpperCase() : char;
}
