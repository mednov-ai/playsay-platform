import { Eye } from "lucide-react";
import { useAppTranslation } from "../../../shared/i18n";
import { materialPreviewFromForm, type MaterialEditorBlock, type MaterialFormState } from "../model/materialDocument";
import { LessonMaterialDocumentView } from "./LessonMaterialDocumentView";

export function MaterialBlockHoverPreview({ block, form }: { block: MaterialEditorBlock | null; form: MaterialFormState }) {
  const { t } = useAppTranslation();

  if (!block) {
    return (
      <aside className="playsay-material-block-preview playsay-material-block-preview-empty">
        <Eye className="h-5 w-5" />
        <strong>{t("materials.editor.blockPreviewTitle")}</strong>
        <p>{t("materials.editor.blockPreviewHint")}</p>
      </aside>
    );
  }

  const previewForm: MaterialFormState = {
    ...form,
    document: {
      ...form.document,
      pages: form.document.pages.slice(0, 1).map((page) => ({ ...page, blocks: [block] })),
    },
  };

  return (
    <aside aria-label={t("materials.editor.blockPreviewAria", { title: block.title })} className="playsay-material-block-preview">
      <div className="playsay-material-block-preview-head">
        <Eye className="h-4 w-4 text-primary" />
        <strong>{t("materials.editor.blockPreviewTitle")}</strong>
      </div>
      <div
        aria-hidden="true"
        className="playsay-material-block-preview-surface"
        ref={(node) => {
          node?.setAttribute("inert", "");
        }}
      >
        <LessonMaterialDocumentView material={materialPreviewFromForm(previewForm)} mode="teacherPreview" showScoreBadge={false} />
      </div>
    </aside>
  );
}
