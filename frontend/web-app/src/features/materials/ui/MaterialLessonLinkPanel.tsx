import { Link2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import type { CourseLesson } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

export type MaterialLessonOption = {
  courseId: string;
  key: string;
  label: string;
  lesson: CourseLesson;
};

export function MaterialLessonLinkPanel({
  disabled,
  formMaterialId,
  lessonOptions,
  onLinkSelectedLesson,
  onSelectLessonKey,
  onUnlinkSelectedLesson,
  selectedLessonKey,
}: {
  disabled: boolean;
  formMaterialId: string | null;
  lessonOptions: MaterialLessonOption[];
  onLinkSelectedLesson: () => void;
  onSelectLessonKey: (value: string) => void;
  onUnlinkSelectedLesson: () => void;
  selectedLessonKey: string;
}) {
  const { t } = useAppTranslation();

  return (
    <div className="rounded-2xl border border-border bg-white p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-extrabold">
        <Link2 className="h-4 w-4 text-primary" />
        {t("materials.linkPanel.title")}
      </div>
      <select
        className="playsay-input"
        disabled={disabled || lessonOptions.length === 0}
        onChange={(event) => onSelectLessonKey(event.target.value)}
        value={selectedLessonKey}
      >
        {lessonOptions.length === 0 ? (
          <option value="">{t("materials.linkPanel.empty")}</option>
        ) : (
          lessonOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))
        )}
      </select>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button disabled={disabled || !formMaterialId || !selectedLessonKey} onClick={onLinkSelectedLesson} type="button">
          <Link2 className="h-4 w-4" />
          {t("materials.linkPanel.link")}
        </Button>
        <Button
          disabled={disabled || !selectedLessonKey}
          onClick={onUnlinkSelectedLesson}
          type="button"
          variant="outline"
        >
          {t("materials.linkPanel.unlink")}
        </Button>
      </div>
    </div>
  );
}
