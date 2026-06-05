import { Monitor, Moon, Sun } from "lucide-react";
import { nextThemeMode, type ThemeMode } from "./index";

interface Props {
  mode: ThemeMode;
  labels: Record<ThemeMode, string>;
  onChange: (mode: ThemeMode) => void;
}

export function ThemeToggle({ mode, labels, onChange }: Props) {
  const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;

  return (
    <button
      type="button"
      className="icon-button"
      onClick={() => onChange(nextThemeMode(mode))}
      aria-label={labels[mode]}
      title={labels[mode]}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
