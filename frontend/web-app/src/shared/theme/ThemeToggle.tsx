import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "../../components/ui/button";
import { useAppTranslation } from "../i18n";
import { nextThemeMode, type ResolvedTheme, type ThemeMode } from "./index";

export function ThemeToggle({
  className,
  mode,
  onModeChange,
  resolvedTheme,
}: {
  className?: string;
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
  resolvedTheme?: ResolvedTheme;
}) {
  const { t } = useAppTranslation();
  const label = t(`shell.theme.${mode}`);
  const ariaLabel = t("shell.theme.toggleAria", { theme: label });
  const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;
  const isDark = resolvedTheme ? resolvedTheme === "dark" : mode === "dark";

  return (
    <Button
      aria-label={ariaLabel}
      className={`${className ? `${className} ` : ""}playsay-theme-toggle-control`}
      onClick={() => onModeChange(nextThemeMode(mode))}
      style={{
        backgroundColor: isDark ? "rgb(34 25 20 / 0.92)" : "rgb(255 255 255 / 0.88)",
        color: isDark ? "rgb(250 242 235)" : "rgb(17 17 17)",
      }}
      title={ariaLabel}
      type="button"
      variant="outline"
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
