import { useEffect, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import type { LessonMaterial } from "../../../shared/api/playsay";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";
import {
  editorDocumentFromJson,
  materialLiveScore,
  materialPageAcceptsAnswers,
  type MaterialAnswerBlock,
  type MaterialAnswerState,
} from "../model/materialDocument";
import { LessonMaterialDocumentView } from "./LessonMaterialDocumentView";

type MaterialPreviewPresentationMode = "default" | "html-game-focus" | "image-focus";

export function MaterialPlayPreviewDialog({
  material,
  onClose,
  open,
}: {
  material: LessonMaterial;
  onClose: () => void;
  open: boolean;
}) {
  const { t } = useAppTranslation();
  const [answers, setAnswers] = useState<MaterialAnswerState>({});
  const [presentationMode, setPresentationMode] = useState<MaterialPreviewPresentationMode>("default");
  const document = editorDocumentFromJson(material.document, material.title);
  const hasAnswerableBlocks = document.pages.some(materialPageAcceptsAnswers);

  useEffect(() => {
    if (!open) {
      setAnswers({});
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (open) {
      setAnswers({});
      setPresentationMode("default");
    }
  }, [material.id, open]);

  if (!open) {
    return null;
  }

  function updateAnswer(blockId: string, answer: MaterialAnswerBlock) {
    setAnswers((current) => ({
      ...current,
      [blockId]: answer,
    }));
  }

  return (
    <div
      aria-label={t("materials.playPreview.aria")}
      aria-modal="true"
      className="playsay-material-play-backdrop"
      role="dialog"
    >
      <div className="playsay-material-play-dialog" data-presentation-mode={presentationMode}>
        <div className="playsay-material-play-toolbar">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase text-primary">{t("materials.playPreview.eyebrow")}</div>
            <div className="truncate text-lg font-extrabold">{material.title}</div>
            <div className="mt-1 text-sm font-semibold text-muted-foreground">
              {t("materials.playPreview.subtitle")}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {hasAnswerableBlocks ? (
              <Button data-testid="material-preview-reset" onClick={() => setAnswers({})} type="button" variant="outline">
                <RotateCcw className="h-4 w-4" />
                {t("materials.playPreview.reset")}
              </Button>
            ) : null}
            <Button onClick={onClose} type="button" variant="outline">
              <X className="h-4 w-4" />
              {t("materials.playPreview.close")}
            </Button>
          </div>
        </div>
        <div className="playsay-material-preview playsay-material-reader playsay-material-play-surface">
          <LessonMaterialDocumentView
            allowVideoFullscreen
            answers={answers}
            material={material}
            mode="classroom"
            onAnswerChange={updateAnswer}
            onPresentationModeChange={setPresentationMode}
            score={materialLiveScore(material, answers)}
          />
        </div>
      </div>
    </div>
  );
}
