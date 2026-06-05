import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const themeStorageKey = "playsay.theme";

const themeModes: readonly ThemeMode[] = ["system", "light", "dark"];

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && themeModes.includes(value as ThemeMode);
}

export function readStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }

  const storedValue = window.localStorage.getItem(themeStorageKey);
  return isThemeMode(storedValue) ? storedValue : "system";
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode !== "system") {
    return mode;
  }

  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyThemeMode(mode: ThemeMode): ResolvedTheme {
  const resolvedTheme = resolveTheme(mode);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(themeStorageKey, mode);
  }

  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.documentElement.dataset.theme = mode;
    document.documentElement.dataset.resolvedTheme = resolvedTheme;
  }

  return resolvedTheme;
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  if (mode === "system") {
    return "light";
  }
  if (mode === "light") {
    return "dark";
  }
  return "system";
}

export function useThemeMode() {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredThemeMode());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(readStoredThemeMode()));

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
    setResolvedTheme(applyThemeMode(nextMode));
  }, []);

  useEffect(() => {
    setResolvedTheme(applyThemeMode(mode));
  }, [mode]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => {
      setResolvedTheme(applyThemeMode(mode));
    };

    media.addEventListener("change", handleSystemThemeChange);
    return () => media.removeEventListener("change", handleSystemThemeChange);
  }, [mode]);

  return {
    mode,
    resolvedTheme,
    setMode,
  };
}
