import { useEffect, useState, type FormEvent } from "react";
import { type CourseLessonMap } from "../../../entities/schedule/model";
import {
  fetchMaterialAssets,
  type Course,
  type CourseLesson,
  type LessonMaterial,
  type LessonMaterialAnswerSuggestionsInput,
  type LessonMaterialAnswerSuggestions,
  type LessonMaterialAsset,
  type LessonMaterialAssetUpdateInput,
  type LessonMaterialDraft,
  type LessonMaterialDraftInput,
  type LessonMaterialGenerateImagesInput,
  type LessonMaterialInput,
  type LessonMaterialUrlDraftInput,
  type MeProfile,
} from "../../../shared/api/playsay";

import {
  MaterialAuthorMode,
  MaterialBlockType,
  MaterialDraftSourceImage,
  MaterialEditorBlock,
  MaterialFormState,
  MaterialImageGenerationProgress,
  countPendingMaterialImageTargets,
  defaultMaterialForm,
  duplicateMaterialForm,
  materialDraftToForm,
  materialFormToInput,
  materialFormWithBlockPatch,
  materialPreviewFromForm,
  materialToForm,
  newMaterialBlock,
  prepareMaterialDraftSourceImage,
  readPromptFromSourceMeta,
  readUrlFromSourceMeta,
} from "../model/materialDocument";
import { useMaterialAssets } from "../hooks/useMaterialAssets";
import { useMaterialLibraryState } from "../hooks/useMaterialLibraryState";
import { MaterialAccessMessage } from "./MaterialAccessMessage";
import { MaterialAuthorSidebar } from "./MaterialAuthorSidebar";
import { MaterialEditorForm } from "./MaterialEditorForm";
import { MaterialLibraryHeader } from "./MaterialLibraryHeader";
import { MaterialPlayPreviewDialog } from "./MaterialPlayPreviewDialog";
import { MaterialReaderPreview } from "./MaterialReaderPreview";
import { useAppTranslation } from "../../../shared/i18n";

export function MaterialLibraryPanel({
  courses,
  disabled,
  lessons,
  loading,
  materials,
  message,
  onArchive,
  onDraft,
  onDraftFromUrl,
  onGenerateImages,
  onSuggestAcceptedAnswers,
  onUpdateAsset,
  onLinkLesson,
  onRefresh,
  onSave,
  profile,
}: {
  courses: Course[];
  disabled: boolean;
  lessons: CourseLessonMap;
  loading: boolean;
  materials: LessonMaterial[];
  message: string | null;
  onArchive: (materialId: string) => void;
  onDraft: (input: LessonMaterialDraftInput) => Promise<LessonMaterialDraft | null>;
  onDraftFromUrl: (input: LessonMaterialUrlDraftInput) => Promise<LessonMaterialDraft | null>;
  onGenerateImages: (materialId: string, input: LessonMaterialGenerateImagesInput) => Promise<LessonMaterial | null>;
  onSuggestAcceptedAnswers: (materialId: string, input: LessonMaterialAnswerSuggestionsInput) => Promise<LessonMaterialAnswerSuggestions | null>;
  onUpdateAsset: (materialId: string, assetId: string, input: LessonMaterialAssetUpdateInput) => Promise<LessonMaterialAsset | null>;
  onLinkLesson: (courseId: string, lesson: CourseLesson, materialId: string | null) => void;
  onRefresh: () => void;
  onSave: (input: LessonMaterialInput, materialId?: string) => Promise<LessonMaterial | null>;
  profile: MeProfile | null;
}) {
  const { t } = useAppTranslation();
  const canManage = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
  const { lessonOptions, selectedLessonKey, setSelectedLessonKey } = useMaterialLibraryState({ courses, lessons });
  const [form, setForm] = useState<MaterialFormState>(() => defaultMaterialForm());
  const [autoSelectedMaterialId, setAutoSelectedMaterialId] = useState<string | null>(null);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftImage, setDraftImage] = useState<MaterialDraftSourceImage | null>(null);
  const [draftImageMessage, setDraftImageMessage] = useState<string | null>(null);
  const [authorMode, setAuthorMode] = useState<MaterialAuthorMode>("preview");
  const [playPreviewOpen, setPlayPreviewOpen] = useState(false);
  const [imageGenerationProgress, setImageGenerationProgress] = useState<MaterialImageGenerationProgress | null>(null);
  const { assetLibrary, currentMaterialAssets, syncMaterialAssets } = useMaterialAssets({
    canManage,
    formMaterialId: form.id,
    materials,
  });
  const canGenerateDraft = draftPrompt.trim().length > 0 || draftImage !== null;
  const canGenerateUrlDraft = draftUrl.trim().length > 0;
  const pendingImageTargetsCount = countPendingMaterialImageTargets(form.document, currentMaterialAssets);
  const canGenerateImages = pendingImageTargetsCount > 0;

  useEffect(() => {
    const firstMaterial = materials[0];
    if (!firstMaterial || autoSelectedMaterialId === firstMaterial.id || form.id || form.title.trim()) {
      return;
    }

    setForm(materialToForm(firstMaterial));
    setDraftPrompt(readPromptFromSourceMeta(firstMaterial.sourceMeta));
    setDraftUrl(readUrlFromSourceMeta(firstMaterial.sourceMeta));
    setAuthorMode("preview");
    setAutoSelectedMaterialId(firstMaterial.id);
  }, [autoSelectedMaterialId, form.id, form.title, materials]);

  function updateForm<Key extends keyof MaterialFormState>(field: Key, value: MaterialFormState[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(defaultMaterialForm());
    setDraftPrompt("");
    setDraftUrl("");
    setDraftImage(null);
    setDraftImageMessage(null);
    setAuthorMode("edit");
  }

  function selectMaterial(material: LessonMaterial) {
    setForm(materialToForm(material));
    setDraftPrompt(readPromptFromSourceMeta(material.sourceMeta));
    setDraftUrl(readUrlFromSourceMeta(material.sourceMeta));
    setDraftImage(null);
    setDraftImageMessage(null);
    setAuthorMode("preview");
  }

  function addBlock(type: MaterialBlockType) {
    setAuthorMode("edit");
    setForm((current) => ({
      ...current,
      document: {
        ...current.document,
        pages: current.document.pages.map((page, index) => (
          index === 0
            ? { ...page, blocks: [...page.blocks, newMaterialBlock(type)] }
            : page
        )),
      },
    }));
  }

  function updateBlock(blockId: string, patch: Partial<MaterialEditorBlock>) {
    setForm((current) => materialFormWithBlockPatch(current, blockId, patch));
  }

  function removeBlock(blockId: string) {
    setForm((current) => ({
      ...current,
      document: {
        ...current.document,
        pages: current.document.pages.map((page) => ({
          ...page,
          blocks: page.blocks.filter((block) => block.id !== blockId),
        })),
      },
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await saveMaterialAndMaybeGenerate({ generateMissing: true });
    if (saved) {
      setForm(materialToForm(saved));
      setAuthorMode("preview");
    }
  }

  async function generateDraft() {
    const prompt = draftPrompt.trim() || t("materials.draft.defaultPrompt");
    const draft = await onDraft({
      title: form.title || null,
      prompt,
      language: form.language,
      cefrLevel: form.cefrLevel,
      sourceImageDataUrl: draftImage?.dataUrl ?? null,
      sourceFileName: draftImage?.fileName ?? null,
    });
    if (draft) {
      setForm(materialDraftToForm(draft));
      setDraftPrompt(readPromptFromSourceMeta(draft.sourceMeta) || prompt);
      setAuthorMode("edit");
    }
  }

  async function generateDraftFromUrl() {
    const url = draftUrl.trim();
    if (!url) {
      return;
    }
    const draft = await onDraftFromUrl({
      url,
      title: form.title || null,
      prompt: draftPrompt.trim() || null,
      language: form.language,
      cefrLevel: form.cefrLevel,
    });
    if (draft) {
      setForm(materialDraftToForm(draft));
      setDraftPrompt(readPromptFromSourceMeta(draft.sourceMeta));
      setDraftUrl(readUrlFromSourceMeta(draft.sourceMeta) || url);
      setAuthorMode("edit");
    }
  }

  async function suggestAcceptedAnswers(blockId: string, itemIds: string[]) {
    if (!form.id) {
      return;
    }
    const result = await onSuggestAcceptedAnswers(form.id, { blockId, itemIds });
    if (!result) {
      return;
    }
    setAuthorMode("edit");
    setForm((current) => ({
      ...current,
      document: {
        ...current.document,
        pages: current.document.pages.map((page) => ({
          ...page,
          blocks: page.blocks.map((block) => {
            if (block.id !== result.blockId || !block.items?.length) {
              return block;
            }
            return {
              ...block,
              items: block.items.map((item, index) => {
                const itemId = item.id?.trim() || `${item.prompt}-${index}`;
                const suggested = result.items.find((suggestionItem) => suggestionItem.itemId === itemId);
                if (!suggested) {
                  return item;
                }
                const existingValues = new Set([
                  item.answer?.trim().toLowerCase(),
                  ...(item.acceptedAnswers ?? []).map((answer) => answer.trim().toLowerCase()),
                ].filter(Boolean));
                const aiSuggestedAnswers = [
                  ...(item.aiSuggestedAnswers ?? []),
                  ...suggested.suggestions.filter((suggestion) => !existingValues.has(suggestion.value.trim().toLowerCase())),
                ];
                return {
                  ...item,
                  aiSuggestedAnswers: aiSuggestedAnswers.filter((suggestion, suggestionIndex, allSuggestions) => (
                    suggestion.value.trim() &&
                    allSuggestions.findIndex((candidate) => candidate.value.trim().toLowerCase() === suggestion.value.trim().toLowerCase()) === suggestionIndex
                  )),
                };
              }),
            };
          }),
        })),
      },
    }));
  }

  async function handleDraftImageChange(file: File | null) {
    setDraftImageMessage(null);
    if (!file) {
      return;
    }

    try {
      const image = await prepareMaterialDraftSourceImage(file);
      setDraftImage(image);
      if (draftPrompt.trim().length === 0) {
        setDraftPrompt(t("materials.draft.defaultScanPrompt"));
      }
    } catch (caught) {
      setDraftImage(null);
      setDraftImageMessage(caught instanceof Error ? caught.message : t("materials.draft.imagePrepareFailed"));
    }
  }

  function linkSelectedLesson() {
    const option = lessonOptions.find((item) => item.key === selectedLessonKey);
    if (!option) {
      return;
    }
    onLinkLesson(option.courseId, option.lesson, form.id);
  }

  function duplicateCurrentMaterial() {
    setForm((current) => duplicateMaterialForm(current));
    setAuthorMode("edit");
  }

  async function saveMaterialAndMaybeGenerate({
    generateMissing = false,
  }: {
    generateMissing?: boolean;
  } = {}): Promise<LessonMaterial | null> {
    const saved = await onSave(materialFormToInput(form), form.id ?? undefined);
    if (!saved) {
      return null;
    }
    if (!generateMissing) {
      return saved;
    }

    let currentMaterial = saved;
    let currentAssets: LessonMaterialAsset[] = [];
    try {
      currentAssets = await fetchMaterialAssets(saved.id);
      syncMaterialAssets(saved, currentAssets);
    } catch {
      currentAssets = [];
    }
    const targetCount = countPendingMaterialImageTargets(materialToForm(currentMaterial).document, currentAssets);
    if (targetCount === 0) {
      return saved;
    }

    try {
      for (let index = 1; index <= targetCount; index += 1) {
        setImageGenerationProgress({ current: index, label: t("materials.progress.generatingImages"), total: targetCount });
        const generated = await onGenerateImages(currentMaterial.id, { maxImages: 1 });
        if (!generated) {
          return currentMaterial;
        }
        currentMaterial = generated;
        setForm(materialToForm(generated));
        try {
          currentAssets = await fetchMaterialAssets(generated.id);
          syncMaterialAssets(generated, currentAssets);
        } catch {
          currentAssets = [];
        }
        const remaining = countPendingMaterialImageTargets(materialToForm(generated).document, currentAssets);
        if (remaining === 0) {
          break;
        }
      }
      return currentMaterial;
    } finally {
      setImageGenerationProgress(null);
    }
  }

  async function generateCurrentImages() {
    const saved = await saveMaterialAndMaybeGenerate({ generateMissing: true });
    if (saved) {
      setForm(materialToForm(saved));
      setAuthorMode("preview");
    }
  }

  function updateMaterialBlock(blockId: string, patch: Partial<MaterialEditorBlock>) {
    updateBlock(blockId, patch);
  }

  async function updatePreviewAssetTags(assetId: string, tags: string[]): Promise<LessonMaterialAsset | null> {
    if (!form.id) {
      return null;
    }
    return onUpdateAsset(form.id, assetId, { tags });
  }

  async function persistMaterialBlockPatch(blockId: string, patch: Partial<MaterialEditorBlock>) {
    const nextForm = materialFormWithBlockPatch(form, blockId, patch);
    setForm(nextForm);
    await onSave(materialFormToInput(nextForm), nextForm.id ?? undefined);
  }

  if (!profile) {
    return (
      <section className="rounded-[1.25rem] border border-border bg-white/80 p-4">
        <MaterialLibraryHeader />
        <MaterialAccessMessage message={t("materials.loginRequired")} />
      </section>
    );
  }

  return (
    <section className="rounded-[1.25rem] border border-border bg-white/80 p-4">
      <MaterialPlayPreviewDialog
        material={materialPreviewFromForm(form)}
        onClose={() => setPlayPreviewOpen(false)}
        open={playPreviewOpen && Boolean(form.title.trim())}
      />
      <MaterialLibraryHeader
        disabled={disabled}
        loading={loading}
        onRefresh={onRefresh}
        withBorder
      />

      {!canManage ? (
        <MaterialAccessMessage message={t("materials.studentAvailability")} />
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.28fr)]">
          <MaterialAuthorSidebar
            canGenerateDraft={canGenerateDraft}
            canGenerateUrlDraft={canGenerateUrlDraft}
            disabled={disabled}
            draftImage={draftImage}
            draftImageMessage={draftImageMessage}
            draftPrompt={draftPrompt}
            draftUrl={draftUrl}
            formMaterialId={form.id}
            lessonOptions={lessonOptions}
            materials={materials}
            onCreateNew={resetForm}
            onDraftFromUrl={() => void generateDraftFromUrl()}
            onDraftImageChange={(file) => void handleDraftImageChange(file)}
            onGenerateDraft={() => void generateDraft()}
            onLinkSelectedLesson={linkSelectedLesson}
            onRemoveDraftImage={() => setDraftImage(null)}
            onSelectLessonKey={setSelectedLessonKey}
            onSelectMaterial={selectMaterial}
            onUnlinkSelectedLesson={() => {
              const option = lessonOptions.find((item) => item.key === selectedLessonKey);
              if (option) {
                onLinkLesson(option.courseId, option.lesson, null);
              }
            }}
            onUpdateDraftPrompt={setDraftPrompt}
            onUpdateDraftUrl={setDraftUrl}
            selectedLessonKey={selectedLessonKey}
          />

          <form className="grid gap-4" onSubmit={submit}>
            {authorMode === "preview" && form.title.trim() ? (
              <MaterialReaderPreview
                disabled={disabled}
                form={form}
                imageGenerationProgress={imageGenerationProgress}
                message={message}
                onArchive={onArchive}
                onBlockPatch={updateMaterialBlock}
                onBlockPatchCommit={(blockId, patch) => void persistMaterialBlockPatch(blockId, patch)}
                onDuplicate={duplicateCurrentMaterial}
                onEdit={() => setAuthorMode("edit")}
                onPlay={() => setPlayPreviewOpen(true)}
                onUpdateAssetTags={updatePreviewAssetTags}
              />
            ) : (
              <MaterialEditorForm
                assetLibrary={assetLibrary}
                canSuggestAcceptedAnswers={Boolean(form.id)}
                canGenerateImages={canGenerateImages}
                disabled={disabled}
                form={form}
                imageGenerationProgress={imageGenerationProgress}
                message={message}
                onAddBlock={addBlock}
                onArchive={onArchive}
                onDuplicate={duplicateCurrentMaterial}
                onGenerateCurrentImages={() => void generateCurrentImages()}
                onSuggestAcceptedAnswers={(blockId, itemIds) => void suggestAcceptedAnswers(blockId, itemIds)}
                onPreview={() => setAuthorMode("preview")}
                onRemoveBlock={removeBlock}
                onUpdateBlock={updateBlock}
                onUpdateForm={updateForm}
                pendingImageTargetsCount={pendingImageTargetsCount}
              />
            )}
          </form>
        </div>
      )}
    </section>
  );
}
