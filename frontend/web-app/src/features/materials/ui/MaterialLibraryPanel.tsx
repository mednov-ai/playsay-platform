import { useEffect, useState, type FormEvent } from "react";
import {
  Archive,
  BookOpen,
  Copy,
  Globe2,
  Loader2,
  LockKeyhole,
  PenLine,
  Play,
  Plus,
  RefreshCw,
} from "lucide-react";
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
import { Button } from "../../../components/ui/button";

import {
  MaterialAssetLibraryItem,
  MaterialAuthorMode,
  MaterialBlockType,
  MaterialDraftSourceImage,
  MaterialEditorBlock,
  MaterialFormState,
  MaterialImageGenerationProgress,
  countPendingMaterialImageTargets,
  defaultMaterialForm,
  duplicateMaterialForm,
  materialAssetLibraryItemFromAsset,
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
import { useMaterialLibraryState } from "../hooks/useMaterialLibraryState";
import { LessonMaterialDocumentView } from "./LessonMaterialDocumentView";
import { MaterialDraftPanel } from "./MaterialDraftPanel";
import { MaterialEditorForm } from "./MaterialEditorForm";
import { MaterialImageProgress } from "./MaterialImageProgress";
import { MaterialLessonLinkPanel } from "./MaterialLessonLinkPanel";
import { MaterialPlayPreviewDialog } from "./MaterialPlayPreviewDialog";
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
  const [assetLibrary, setAssetLibrary] = useState<MaterialAssetLibraryItem[]>([]);
  const canGenerateDraft = draftPrompt.trim().length > 0 || draftImage !== null;
  const canGenerateUrlDraft = draftUrl.trim().length > 0;
  const currentMaterialAssets = form.id
    ? assetLibrary.filter((item) => item.materialId === form.id).map((item) => item.asset)
    : [];
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

  useEffect(() => {
    if (!canManage || materials.length === 0) {
      setAssetLibrary([]);
      return;
    }

    let active = true;

    Promise.allSettled(
      materials.slice(0, 40).map(async (material) => {
        const assets = await fetchMaterialAssets(material.id);
        return assets
          .map((asset) => materialAssetLibraryItemFromAsset(material, asset))
          .filter((item): item is MaterialAssetLibraryItem => item !== null);
      }),
    ).then((results) => {
      if (!active) {
        return;
      }

      setAssetLibrary(results.flatMap((result) => (
        result.status === "fulfilled" ? result.value : []
      )));
    });

    return () => {
      active = false;
    };
  }, [canManage, materials]);

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

  function syncMaterialAssets(material: LessonMaterial, assets: LessonMaterialAsset[]) {
    const nextItems = assets
      .map((asset) => materialAssetLibraryItemFromAsset(material, asset))
      .filter((item): item is MaterialAssetLibraryItem => item !== null);
    setAssetLibrary((current) => [
      ...current.filter((item) => item.materialId !== material.id),
      ...nextItems,
    ]);
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
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-extrabold">{t("materials.title")}</h2>
        </div>
        <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
          {t("materials.loginRequired")}
        </div>
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-extrabold">{t("materials.title")}</h2>
        </div>
        <Button disabled={disabled} onClick={onRefresh} type="button" variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t("common.actions.refresh")}
        </Button>
      </div>

      {!canManage ? (
        <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
          {t("materials.studentAvailability")}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.28fr)]">
          <aside className="grid content-start gap-3">
            <div className="rounded-2xl border border-border bg-muted/45 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-sm font-extrabold">{t("materials.library.title")}</div>
                <Button disabled={disabled} onClick={resetForm} type="button" variant="outline">
                  <Plus className="h-4 w-4" />
                  {t("materials.library.new")}
                </Button>
              </div>
              {materials.length === 0 ? (
                <div className="rounded-xl border border-border bg-white p-3 text-sm font-semibold text-muted-foreground">
                  {t("materials.library.empty")}
                </div>
              ) : (
                <div className="grid max-h-[30rem] gap-2 overflow-auto pr-1">
                  {materials.map((material) => (
                    <button
                      className="playsay-material-list-item"
                      data-active={form.id === material.id ? "true" : "false"}
                      key={material.id}
                      onClick={() => selectMaterial(material)}
                      type="button"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-extrabold">{material.title}</span>
                        <span className="mt-1 flex flex-wrap gap-1.5 text-[0.68rem] font-black uppercase text-muted-foreground">
                          <span>{material.cefrLevel}</span>
                          <span>{material.status}</span>
                          <span>{material.visibility}</span>
                          <span>{t("materials.library.blocks", { count: material.blockCount })}</span>
                        </span>
                      </span>
                      {material.visibility === "PUBLIC" ? (
                        <Globe2 className="h-4 w-4 shrink-0 text-primary" />
                      ) : (
                        <LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <MaterialDraftPanel
              canGenerateDraft={canGenerateDraft}
              canGenerateUrlDraft={canGenerateUrlDraft}
              disabled={disabled}
              draftImage={draftImage}
              draftImageMessage={draftImageMessage}
              draftPrompt={draftPrompt}
              draftUrl={draftUrl}
              onDraftFromUrl={() => void generateDraftFromUrl()}
              onDraftImageChange={(file) => void handleDraftImageChange(file)}
              onGenerateDraft={() => void generateDraft()}
              onRemoveDraftImage={() => setDraftImage(null)}
              onUpdateDraftPrompt={setDraftPrompt}
              onUpdateDraftUrl={setDraftUrl}
            />

            <MaterialLessonLinkPanel
              disabled={disabled}
              formMaterialId={form.id}
              lessonOptions={lessonOptions}
              onLinkSelectedLesson={linkSelectedLesson}
              onSelectLessonKey={setSelectedLessonKey}
              onUnlinkSelectedLesson={() => {
                const option = lessonOptions.find((item) => item.key === selectedLessonKey);
                if (option) {
                  onLinkLesson(option.courseId, option.lesson, null);
                }
              }}
              selectedLessonKey={selectedLessonKey}
            />
          </aside>

          <form className="grid gap-4" onSubmit={submit}>
            {authorMode === "preview" && form.title.trim() ? (
              <>
                <div className="playsay-material-reader-toolbar">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-extrabold">{form.title}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[0.7rem] font-black uppercase text-muted-foreground">
                      <span>{form.cefrLevel}</span>
                      <span>{form.status}</span>
                      <span>{form.visibility}</span>
                      <span>{t("materials.library.blocks", { count: form.document.pages[0]?.blocks.length ?? 0 })}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button disabled={disabled || form.title.trim().length === 0} onClick={() => setPlayPreviewOpen(true)} type="button">
                      <Play className="h-4 w-4" />
                      {t("materials.actions.play")}
                    </Button>
                    <Button disabled={disabled} onClick={() => setAuthorMode("edit")} type="button" variant="outline">
                      <PenLine className="h-4 w-4" />
                      {t("materials.actions.textMode")}
                    </Button>
                    <Button disabled={disabled || form.title.trim().length === 0} onClick={duplicateCurrentMaterial} type="button" variant="outline">
                      <Copy className="h-4 w-4" />
                      {t("materials.actions.duplicate")}
                    </Button>
                    {form.id ? (
                      <Button disabled={disabled} onClick={() => onArchive(form.id!)} type="button" variant="outline">
                        <Archive className="h-4 w-4" />
                        {t("materials.actions.archive")}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {imageGenerationProgress ? (
                  <MaterialImageProgress value={imageGenerationProgress} />
                ) : null}
                <div className="playsay-material-preview playsay-material-reader">
                  <LessonMaterialDocumentView
                    material={materialPreviewFromForm(form)}
                    mode="teacherPreview"
                    onAssetTagsChange={updatePreviewAssetTags}
                    onBlockPatchCommit={(blockId, patch) => void persistMaterialBlockPatch(blockId, patch)}
                    onBlockPatch={updateMaterialBlock}
                  />
                </div>
                {message ? (
                  <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
                    {message}
                  </div>
                ) : null}
              </>
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
