import { useEffect } from "react";
import { Check, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";
import { HtmlGameFrame } from "./blocks/HtmlGameFrame";

export function GameAdaptationReviewDialog({
  html,
  onApply,
  onClose,
  report,
}: {
  html: string;
  onApply: () => void;
  onClose: () => void;
  report?: string | null;
}) {
  const { t } = useAppTranslation();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      aria-label={t("materials.gameAdaptationReview.aria")}
      aria-modal="true"
      className="playsay-material-play-backdrop"
      role="dialog"
    >
      <div className="playsay-material-play-dialog">
        <div className="playsay-material-play-toolbar">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase text-primary">
              {t("materials.gameAdaptationReview.eyebrow")}
            </div>
            <div className="text-lg font-extrabold">{t("materials.gameAdaptationReview.title")}</div>
            {report ? <div className="mt-1 text-sm font-semibold text-muted-foreground">{report}</div> : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={onClose} type="button" variant="outline">
              <X className="h-4 w-4" />
              {t("materials.gameAdaptationReview.close")}
            </Button>
            <Button onClick={onApply} type="button">
              <Check className="h-4 w-4" />
              {t("materials.gameAdaptationReview.apply")}
            </Button>
          </div>
        </div>
        <div className="playsay-material-preview playsay-material-reader playsay-material-play-surface p-4">
          <HtmlGameFrame
            blockId="game-adaptation-preview"
            fillAvailable
            height={640}
            html={html}
            title={t("materials.gameAdaptationReview.frameTitle")}
          />
        </div>
      </div>
    </div>
  );
}
