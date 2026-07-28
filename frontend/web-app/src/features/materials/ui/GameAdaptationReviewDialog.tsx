import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Loader2, X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";
import { classifyGameHtml } from "@playsay/game-sync";
import {
  HtmlGameFrame,
  type HtmlGameRuntimeStatus,
} from "./blocks/HtmlGameFrame";

const STARTUP_TIMEOUT_MS = 8_000;

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
  const sdkCompatible = classifyGameHtml(html) === "SDK_V1";
  const [runtimeStatus, setRuntimeStatus] = useState<HtmlGameRuntimeStatus>(
    sdkCompatible ? "checking" : "failed",
  );

  useEffect(() => {
    setRuntimeStatus(sdkCompatible ? "checking" : "failed");
  }, [html, sdkCompatible]);

  useEffect(() => {
    if (runtimeStatus !== "checking") return undefined;
    const timeout = window.setTimeout(() => setRuntimeStatus("failed"), STARTUP_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [html, runtimeStatus]);

  const handleRuntimeStatusChange = useCallback((status: HtmlGameRuntimeStatus) => {
    if (!sdkCompatible) return;
    setRuntimeStatus((current) => current === "failed" ? current : status);
  }, [sdkCompatible]);

  const handleApply = useCallback(() => {
    if (runtimeStatus === "ready") onApply();
  }, [onApply, runtimeStatus]);

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
            <Button
              aria-describedby="game-adaptation-runtime-status"
              disabled={runtimeStatus !== "ready"}
              onClick={handleApply}
              type="button"
            >
              <Check className="h-4 w-4" />
              {t("materials.gameAdaptationReview.apply")}
            </Button>
          </div>
        </div>
        <div
          aria-live="polite"
          className="flex items-center gap-2 border-b border-border bg-background/80 px-4 py-2 text-sm font-semibold"
          data-status={runtimeStatus}
          id="game-adaptation-runtime-status"
          role="status"
        >
          {runtimeStatus === "checking" ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : runtimeStatus === "ready" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          )}
          <span>{t(`materials.gameAdaptationReview.runtime.${runtimeStatus}`)}</span>
        </div>
        <div className="playsay-material-preview playsay-material-reader playsay-material-play-surface p-4">
          <HtmlGameFrame
            blockId="game-adaptation-preview"
            fillAvailable
            height={640}
            html={html}
            onRuntimeStatusChange={handleRuntimeStatusChange}
            title={t("materials.gameAdaptationReview.frameTitle")}
          />
        </div>
      </div>
    </div>
  );
}
