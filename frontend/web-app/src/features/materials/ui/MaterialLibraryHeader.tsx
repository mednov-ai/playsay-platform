import { BookOpen, Loader2, RefreshCw } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";

export function MaterialLibraryHeader({
  disabled = false,
  loading = false,
  onRefresh,
  withBorder = false,
}: {
  disabled?: boolean;
  loading?: boolean;
  onRefresh?: () => void;
  withBorder?: boolean;
}) {
  const { t } = useAppTranslation();

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3${withBorder ? " border-b border-border pb-4" : ""}`}>
      <div className="flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-extrabold">{t("materials.title")}</h2>
      </div>
      {onRefresh ? (
        <Button disabled={disabled} onClick={onRefresh} type="button" variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t("common.actions.refresh")}
        </Button>
      ) : null}
    </div>
  );
}
