import { FINGER_COLOR, type Finger, type LayoutId } from "../../shared/types";
import type { CSSProperties } from "react";

interface CharKey {
  en: string;
  ru: string;
  finger?: Finger;
  width?: number;
}

interface SpecialKey {
  labelKey: keyof KeyboardLabels;
  width: number;
  special: true;
  finger?: Finger;
  space?: boolean;
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

const rows: Key[][] = [
  [
    { en: "`", ru: "ё", finger: "leftPinky" },
    { en: "1", ru: "1", finger: "leftPinky" },
    { en: "2", ru: "2", finger: "leftRing" },
    { en: "3", ru: "3", finger: "leftMiddle" },
    { en: "4", ru: "4", finger: "leftIndex" },
    { en: "5", ru: "5", finger: "leftIndex" },
    { en: "6", ru: "6", finger: "rightIndex" },
    { en: "7", ru: "7", finger: "rightIndex" },
    { en: "8", ru: "8", finger: "rightMiddle" },
    { en: "9", ru: "9", finger: "rightRing" },
    { en: "0", ru: "0", finger: "rightPinky" },
    { en: "-", ru: "-", finger: "rightPinky" },
    { en: "=", ru: "=", finger: "rightPinky" },
    { labelKey: "backspace", width: 2, special: true, finger: "rightPinky" },
  ],
  [
    { labelKey: "tab", width: 1.5, special: true, finger: "leftPinky" },
    { en: "q", ru: "й", finger: "leftPinky" },
    { en: "w", ru: "ц", finger: "leftRing" },
    { en: "e", ru: "у", finger: "leftMiddle" },
    { en: "r", ru: "к", finger: "leftIndex" },
    { en: "t", ru: "е", finger: "leftIndex" },
    { en: "y", ru: "н", finger: "rightIndex" },
    { en: "u", ru: "г", finger: "rightIndex" },
    { en: "i", ru: "ш", finger: "rightMiddle" },
    { en: "o", ru: "щ", finger: "rightRing" },
    { en: "p", ru: "з", finger: "rightPinky" },
    { en: "[", ru: "х", finger: "rightPinky" },
    { en: "]", ru: "ъ", finger: "rightPinky" },
    { en: "\\", ru: "\\", width: 1.5, finger: "rightPinky" },
  ],
  [
    { labelKey: "caps", width: 1.75, special: true, finger: "leftPinky" },
    { en: "a", ru: "ф", finger: "leftPinky" },
    { en: "s", ru: "ы", finger: "leftRing" },
    { en: "d", ru: "в", finger: "leftMiddle" },
    { en: "f", ru: "а", finger: "leftIndex" },
    { en: "g", ru: "п", finger: "leftIndex" },
    { en: "h", ru: "р", finger: "rightIndex" },
    { en: "j", ru: "о", finger: "rightIndex" },
    { en: "k", ru: "л", finger: "rightMiddle" },
    { en: "l", ru: "д", finger: "rightRing" },
    { en: ";", ru: "ж", finger: "rightPinky" },
    { en: "'", ru: "э", finger: "rightPinky" },
    { labelKey: "enter", width: 2.25, special: true, finger: "rightPinky" },
  ],
  [
    { labelKey: "shift", width: 2.25, special: true, finger: "leftPinky" },
    { en: "z", ru: "я", finger: "leftPinky" },
    { en: "x", ru: "ч", finger: "leftRing" },
    { en: "c", ru: "с", finger: "leftMiddle" },
    { en: "v", ru: "м", finger: "leftIndex" },
    { en: "b", ru: "и", finger: "leftIndex" },
    { en: "n", ru: "т", finger: "rightIndex" },
    { en: "m", ru: "ь", finger: "rightIndex" },
    { en: ",", ru: "б", finger: "rightMiddle" },
    { en: ".", ru: "ю", finger: "rightRing" },
    { en: "/", ru: ".", finger: "rightPinky" },
    { labelKey: "shift", width: 2.75, special: true, finger: "rightPinky" },
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
}

export function VirtualKeyboard({ labels, layoutId, nextChar }: Props) {
  return (
    <div className="virtual-keyboard" aria-hidden="true">
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
              const active = key.space === true && nextChar === " ";
              return (
                <div
                  key={`${rowIndex}-${keyIndex}`}
                  className={`virtual-keyboard__key virtual-keyboard__key--special ${active ? "is-active" : ""}`}
                  style={style}
                >
                  {key.space ? "" : labels[key.labelKey]}
                </div>
              );
            }

            const char = layoutId === "RU" ? key.ru : key.en;
            const active = nextChar != null && char === nextChar;
            return (
              <div
                key={`${rowIndex}-${keyIndex}`}
                className={`virtual-keyboard__key ${active ? "is-active" : ""}`}
                style={style}
              >
                {/\p{L}/u.test(char) ? char.toUpperCase() : char}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
