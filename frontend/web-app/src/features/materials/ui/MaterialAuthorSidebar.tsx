import type { LessonMaterial } from "../../../shared/api/playsay";
import type { MaterialDraftSourceImage } from "../model/materialDocument";
import { MaterialDraftPanel } from "./MaterialDraftPanel";
import { MaterialLessonLinkPanel, type MaterialLessonOption } from "./MaterialLessonLinkPanel";
import { MaterialLibraryList } from "./MaterialLibraryList";

export function MaterialAuthorSidebar({
  canGenerateDraft,
  canGenerateUrlDraft,
  disabled,
  draftImage,
  draftImageMessage,
  draftPrompt,
  draftUrl,
  formMaterialId,
  lessonOptions,
  materials,
  onCreateNew,
  onDraftFromUrl,
  onDraftImageChange,
  onGenerateDraft,
  onLinkSelectedLesson,
  onRemoveDraftImage,
  onSelectLessonKey,
  onSelectMaterial,
  onUnlinkSelectedLesson,
  onUpdateDraftPrompt,
  onUpdateDraftUrl,
  selectedLessonKey,
}: {
  canGenerateDraft: boolean;
  canGenerateUrlDraft: boolean;
  disabled: boolean;
  draftImage: MaterialDraftSourceImage | null;
  draftImageMessage: string | null;
  draftPrompt: string;
  draftUrl: string;
  formMaterialId: string | null;
  lessonOptions: MaterialLessonOption[];
  materials: LessonMaterial[];
  onCreateNew: () => void;
  onDraftFromUrl: () => void;
  onDraftImageChange: (file: File | null) => void;
  onGenerateDraft: () => void;
  onLinkSelectedLesson: () => void;
  onRemoveDraftImage: () => void;
  onSelectLessonKey: (value: string) => void;
  onSelectMaterial: (material: LessonMaterial) => void;
  onUnlinkSelectedLesson: () => void;
  onUpdateDraftPrompt: (value: string) => void;
  onUpdateDraftUrl: (value: string) => void;
  selectedLessonKey: string;
}) {
  return (
    <aside className="grid content-start gap-3">
      <MaterialLibraryList
        activeMaterialId={formMaterialId}
        disabled={disabled}
        materials={materials}
        onCreateNew={onCreateNew}
        onSelectMaterial={onSelectMaterial}
      />

      <MaterialDraftPanel
        canGenerateDraft={canGenerateDraft}
        canGenerateUrlDraft={canGenerateUrlDraft}
        disabled={disabled}
        draftImage={draftImage}
        draftImageMessage={draftImageMessage}
        draftPrompt={draftPrompt}
        draftUrl={draftUrl}
        onDraftFromUrl={onDraftFromUrl}
        onDraftImageChange={onDraftImageChange}
        onGenerateDraft={onGenerateDraft}
        onRemoveDraftImage={onRemoveDraftImage}
        onUpdateDraftPrompt={onUpdateDraftPrompt}
        onUpdateDraftUrl={onUpdateDraftUrl}
      />

      <MaterialLessonLinkPanel
        disabled={disabled}
        formMaterialId={formMaterialId}
        lessonOptions={lessonOptions}
        onLinkSelectedLesson={onLinkSelectedLesson}
        onSelectLessonKey={onSelectLessonKey}
        onUnlinkSelectedLesson={onUnlinkSelectedLesson}
        selectedLessonKey={selectedLessonKey}
      />
    </aside>
  );
}
