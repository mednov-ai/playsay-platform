import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Archive,
  BookOpen,
  Copy,
  Eye,
  Globe2,
  Link2,
  Loader2,
  LockKeyhole,
  Paperclip,
  PenLine,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { type CourseLessonMap } from "../../../entities/schedule/model";
import {
  fetchMaterialAssets,
  type Course,
  type CourseLesson,
  type LessonMaterial,
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
import { FormField } from "../../../shared/ui/FormField";

import {
  MaterialAssetLibraryItem,
  MaterialAuthorMode,
  MaterialBlockType,
  MaterialDraftSourceImage,
  MaterialEditorBlock,
  MaterialFormState,
  MaterialImageGenerationProgress,
  MaterialMatchingPair,
  clampNumber,
  countPendingMaterialImageTargets,
  defaultMatchingImagePrompt,
  defaultMaterialForm,
  defaultObjectiveAssessmentPolicy,
  duplicateMaterialForm,
  editableMatchingPairs,
  emptyMatchingPair,
  flattenCourseLessonMaterialOptions,
  formatExerciseItems,
  formatFileSize,
  formatFlashcards,
  isObjectiveMaterialBlockType,
  matchingAssetSearchResults,
  materialAssetLibraryItemFromAsset,
  materialBlockIcon,
  materialBlockLabel,
  materialDraftToForm,
  materialFormToInput,
  materialFormWithBlockPatch,
  materialMatchingPairTargetKind,
  materialPreviewFromForm,
  materialToForm,
  newMaterialBlock,
  parseExerciseItems,
  parseFlashcards,
  prepareMaterialDraftSourceImage,
  readPromptFromSourceMeta,
  readUrlFromSourceMeta,
} from "../model/materialDocument";
import { LessonMaterialDocumentView } from "./LessonMaterialDocumentView";
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
  onUpdateAsset: (materialId: string, assetId: string, input: LessonMaterialAssetUpdateInput) => Promise<LessonMaterialAsset | null>;
  onLinkLesson: (courseId: string, lesson: CourseLesson, materialId: string | null) => void;
  onRefresh: () => void;
  onSave: (input: LessonMaterialInput, materialId?: string) => Promise<LessonMaterial | null>;
  profile: MeProfile | null;
}) {
  const canManage = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
  const lessonOptions = flattenCourseLessonMaterialOptions(courses, lessons);
  const [form, setForm] = useState<MaterialFormState>(() => defaultMaterialForm());
  const [autoSelectedMaterialId, setAutoSelectedMaterialId] = useState<string | null>(null);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftImage, setDraftImage] = useState<MaterialDraftSourceImage | null>(null);
  const [draftImageMessage, setDraftImageMessage] = useState<string | null>(null);
  const [authorMode, setAuthorMode] = useState<MaterialAuthorMode>("preview");
  const [selectedLessonKey, setSelectedLessonKey] = useState("");
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
    if (selectedLessonKey || lessonOptions.length === 0) {
      return;
    }
    setSelectedLessonKey(lessonOptions[0].key);
  }, [lessonOptions, selectedLessonKey]);

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
    const prompt = draftPrompt.trim() || "Создай редактируемый материал Play&Say по приложенному скану или фото задания.";
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

  async function handleDraftImageChange(file: File | null) {
    setDraftImageMessage(null);
    if (!file) {
      return;
    }

    try {
      const image = await prepareMaterialDraftSourceImage(file);
      setDraftImage(image);
      if (draftPrompt.trim().length === 0) {
        setDraftPrompt("Создай редактируемый материал Play&Say по приложенному скану: выдели упражнения, ответы и добавь speaking follow-up.");
      }
    } catch (caught) {
      setDraftImage(null);
      setDraftImageMessage(caught instanceof Error ? caught.message : "Не удалось подготовить изображение.");
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
        setImageGenerationProgress({ current: index, label: "Генерируем картинки", total: targetCount });
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
          <h2 className="text-lg font-extrabold">Материалы</h2>
        </div>
        <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
          Войдите, чтобы создавать и открывать материалы уроков.
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[1.25rem] border border-border bg-white/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-extrabold">Материалы</h2>
        </div>
        <Button disabled={disabled} onClick={onRefresh} type="button" variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Обновить
        </Button>
      </div>

      {!canManage ? (
        <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
          Сейчас ученику доступны опубликованные материалы только внутри назначенного урока.
        </div>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.28fr)]">
          <aside className="grid content-start gap-3">
            <div className="rounded-2xl border border-border bg-muted/45 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-sm font-extrabold">Библиотека</div>
                <Button disabled={disabled} onClick={resetForm} type="button" variant="outline">
                  <Plus className="h-4 w-4" />
                  Новый
                </Button>
              </div>
              {materials.length === 0 ? (
                <div className="rounded-xl border border-border bg-white p-3 text-sm font-semibold text-muted-foreground">
                  Материалов пока нет.
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
                          <span>{material.blockCount} blocks</span>
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

            <div className="rounded-2xl border border-border bg-white p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-extrabold">
                <Wand2 className="h-4 w-4 text-primary" />
                Черновик с AI
              </div>
              <textarea
                className="playsay-input min-h-28 resize-none py-3"
                disabled={disabled}
                maxLength={4_000}
                onChange={(event) => setDraftPrompt(event.target.value)}
                placeholder="Например: A2, travelling, 45 минут, warm-up, слова, speaking и короткое письмо"
                value={draftPrompt}
              />
              <label className="mt-2 block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-black uppercase text-muted-foreground">
                  <Globe2 className="h-3.5 w-3.5 text-primary" />
                  Внешняя страница
                </span>
                <input
                  className="playsay-input"
                  disabled={disabled}
                  maxLength={2_000}
                  onChange={(event) => setDraftUrl(event.target.value)}
                  placeholder="https://..."
                  type="url"
                  value={draftUrl}
                />
              </label>
              <label className="mt-2 block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-black uppercase text-muted-foreground">
                  <Paperclip className="h-3.5 w-3.5 text-primary" />
                  Фото или скан
                </span>
                <input
                  accept="image/jpeg,image/png,image/webp"
                  className="playsay-file-input"
                  disabled={disabled}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0] ?? null;
                    event.currentTarget.value = "";
                    void handleDraftImageChange(file);
                  }}
                  type="file"
                />
              </label>
              {draftImage ? (
                <div className="playsay-draft-image-preview">
                  <img alt="" src={draftImage.dataUrl} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-extrabold">{draftImage.fileName}</div>
                    <div className="text-xs font-bold text-muted-foreground">
                      {formatFileSize(draftImage.originalSize)} · подготовлено для AI
                    </div>
                  </div>
                  <Button disabled={disabled} onClick={() => setDraftImage(null)} type="button" variant="outline">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
              {draftImageMessage ? (
                <div className="mt-2 rounded-xl border border-border bg-muted/60 p-2 text-xs font-bold text-muted-foreground">
                  {draftImageMessage}
                </div>
              ) : null}
              <Button
                className="mt-2 w-full"
                disabled={disabled || !canGenerateDraft}
                onClick={() => void generateDraft()}
                type="button"
              >
                <Sparkles className="h-4 w-4" />
                Подготовить черновик
              </Button>
              <Button
                className="mt-2 w-full"
                disabled={disabled || !canGenerateUrlDraft}
                onClick={() => void generateDraftFromUrl()}
                type="button"
                variant="outline"
              >
                <Globe2 className="h-4 w-4" />
                Черновик из ссылки
              </Button>
            </div>

            <div className="rounded-2xl border border-border bg-white p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-extrabold">
                <Link2 className="h-4 w-4 text-primary" />
                Привязка к уроку
              </div>
              <select
                className="playsay-input"
                disabled={disabled || lessonOptions.length === 0}
                onChange={(event) => setSelectedLessonKey(event.target.value)}
                value={selectedLessonKey}
              >
                {lessonOptions.length === 0 ? (
                  <option value="">Создайте урок курса</option>
                ) : (
                  lessonOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))
                )}
              </select>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button disabled={disabled || !form.id || !selectedLessonKey} onClick={linkSelectedLesson} type="button">
                  <Link2 className="h-4 w-4" />
                  Привязать
                </Button>
                <Button
                  disabled={disabled || !selectedLessonKey}
                  onClick={() => {
                    const option = lessonOptions.find((item) => item.key === selectedLessonKey);
                    if (option) {
                      onLinkLesson(option.courseId, option.lesson, null);
                    }
                  }}
                  type="button"
                  variant="outline"
                >
                  Снять
                </Button>
              </div>
            </div>
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
                      <span>{form.document.pages[0]?.blocks.length ?? 0} blocks</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button disabled={disabled} onClick={() => setAuthorMode("edit")} type="button" variant="outline">
                      <PenLine className="h-4 w-4" />
                      Текст
                    </Button>
                    <Button disabled={disabled || form.title.trim().length === 0} onClick={duplicateCurrentMaterial} type="button" variant="outline">
                      <Copy className="h-4 w-4" />
                      Дублировать
                    </Button>
                    {form.id ? (
                      <Button disabled={disabled} onClick={() => onArchive(form.id!)} type="button" variant="outline">
                        <Archive className="h-4 w-4" />
                        Архив
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
              <>
            <div className="rounded-2xl border border-border bg-white p-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_7rem_8rem_8rem]">
                <FormField label="Название">
                  <input
                    className="playsay-input"
                    disabled={disabled}
                    maxLength={160}
                    onChange={(event) => updateForm("title", event.target.value)}
                    required
                    value={form.title}
                  />
                </FormField>
                <FormField label="Уровень">
                  <select
                    className="playsay-input"
                    disabled={disabled}
                    onChange={(event) => updateForm("cefrLevel", event.target.value)}
                    value={form.cefrLevel}
                  >
                    {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Доступ">
                  <select
                    className="playsay-input"
                    disabled={disabled}
                    onChange={(event) => updateForm("visibility", event.target.value as MaterialFormState["visibility"])}
                    value={form.visibility}
                  >
                    <option value="PRIVATE">Приватный</option>
                    <option value="PUBLIC">Публичный</option>
                  </select>
                </FormField>
                <FormField label="Статус">
                  <select
                    className="playsay-input"
                    disabled={disabled}
                    onChange={(event) => updateForm("status", event.target.value as MaterialFormState["status"])}
                    value={form.status}
                  >
                    <option value="DRAFT">Черновик</option>
                    <option value="PUBLISHED">Опубликован</option>
                  </select>
                </FormField>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-[8rem_minmax(0,1fr)]">
                <FormField label="Язык">
                  <input
                    className="playsay-input"
                    disabled={disabled}
                    maxLength={16}
                    onChange={(event) => updateForm("language", event.target.value)}
                    value={form.language}
                  />
                </FormField>
                <FormField label="Описание">
                  <input
                    className="playsay-input"
                    disabled={disabled}
                    maxLength={2_000}
                    onChange={(event) => updateForm("description", event.target.value)}
                    placeholder="Короткая заметка для себя"
                    value={form.description}
                  />
                </FormField>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {(["text", "videoEmbed", "image", "generatedImage", "flashcards", "fillGaps", "multipleChoice", "matchingPairs", "freeWriting", "speakingPrompt", "drawingArea"] as MaterialBlockType[]).map((type) => (
                    <Button disabled={disabled} key={type} onClick={() => addBlock(type)} type="button" variant="outline">
                      {materialBlockIcon(type)}
                      {materialBlockLabel(type)}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button disabled={disabled || form.title.trim().length === 0} onClick={duplicateCurrentMaterial} type="button" variant="outline">
                    <Copy className="h-4 w-4" />
                    Дублировать
                  </Button>
                  <Button disabled={disabled || form.title.trim().length === 0} onClick={() => setAuthorMode("preview")} type="button" variant="outline">
                    <Eye className="h-4 w-4" />
                    Просмотр
                  </Button>
                  <Button disabled={disabled || !canGenerateImages || form.title.trim().length === 0} onClick={() => void generateCurrentImages()} type="button" variant="outline">
                    <Sparkles className="h-4 w-4" />
                    {pendingImageTargetsCount > 0 ? `Сгенерировать (${pendingImageTargetsCount})` : "Сгенерировать"}
                  </Button>
                  {form.id ? (
                    <Button disabled={disabled} onClick={() => onArchive(form.id!)} type="button" variant="outline">
                      <Archive className="h-4 w-4" />
                      Архив
                    </Button>
                  ) : null}
                  <Button disabled={disabled || form.title.trim().length === 0} type="submit">
                    <Save className="h-4 w-4" />
                    Сохранить
                  </Button>
                </div>
              </div>
              {imageGenerationProgress ? (
                <MaterialImageProgress value={imageGenerationProgress} />
              ) : null}
            </div>

            <div className="playsay-material-editor">
              {form.document.pages[0]?.blocks.length === 0 ? (
                <div className="rounded-2xl border border-border bg-muted/60 p-4 text-sm font-semibold text-muted-foreground">
                  Добавьте первый блок материала.
                </div>
              ) : (
                form.document.pages[0]?.blocks.map((block, index) => (
                  <MaterialBlockEditor
                    assetLibrary={assetLibrary}
                    block={block}
                    currentMaterialId={form.id}
                    disabled={disabled}
                    index={index}
                    key={block.id}
                    onRemove={() => removeBlock(block.id)}
                    onUpdate={(patch) => updateBlock(block.id, patch)}
                  />
                ))
              )}
            </div>

            {message ? (
              <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
                {message}
              </div>
            ) : null}
              </>
            )}
          </form>
        </div>
      )}
    </section>
  );
}

function MaterialImageProgress({ value }: { value: MaterialImageGenerationProgress }) {
  const ratio = value.current ? value.current / Math.max(1, value.total) : 1;
  const progressText = value.current ? `${value.current} из ${value.total}` : `${value.total} картинок`;

  return (
    <div className="mt-3 rounded-xl border border-primary/20 bg-[#fff7f1] px-3 py-2">
      <div className="flex items-center justify-between gap-3 text-xs font-extrabold text-primary">
        <span>{value.label}</span>
        <span>{progressText}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${Math.round(clampNumber(ratio, 0.08, 1) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function MaterialBlockEditor({
  assetLibrary,
  block,
  currentMaterialId,
  disabled,
  index,
  onRemove,
  onUpdate,
}: {
  assetLibrary: MaterialAssetLibraryItem[];
  block: MaterialEditorBlock;
  currentMaterialId: string | null;
  disabled: boolean;
  index: number;
  onRemove: () => void;
  onUpdate: (patch: Partial<MaterialEditorBlock>) => void;
}) {
  const exerciseType = block.type === "multipleChoice" ? "multipleChoice" : "fillGaps";
  const [flashcardsSource, setFlashcardsSource] = useState(() => formatFlashcards(block.cards));
  const [exerciseSource, setExerciseSource] = useState(() => formatExerciseItems(block.items, exerciseType));

  useEffect(() => {
    setFlashcardsSource(formatFlashcards(block.cards));
    setExerciseSource(formatExerciseItems(block.items, exerciseType));
  }, [block.id, block.type, exerciseType]);

  return (
    <article className="rounded-2xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-black text-muted-foreground">
              {index + 1}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#fff3eb] px-2 py-1 text-xs font-black text-primary">
              {materialBlockIcon(block.type)}
              {materialBlockLabel(block.type)}
            </span>
          </div>
          <input
            className="mt-3 w-full border-0 bg-transparent p-0 text-lg font-black outline-none"
            disabled={disabled}
            maxLength={160}
            onChange={(event) => onUpdate({ title: event.target.value })}
            value={block.title}
          />
        </div>
        <Button disabled={disabled} onClick={onRemove} type="button" variant="outline">
          <Trash2 className="h-4 w-4" />
          Удалить
        </Button>
      </div>

      <div className="mt-3 grid gap-3">
        {block.type === "videoEmbed" ? (
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <FormField label="Платформа">
              <select
                className="playsay-input"
                disabled={disabled}
                onChange={(event) => onUpdate({ provider: event.target.value })}
                value={block.provider ?? "YOUTUBE"}
              >
                <option value="YOUTUBE">YouTube</option>
                <option value="VK">VK</option>
                <option value="RUTUBE">Rutube</option>
              </select>
            </FormField>
            <FormField label="Ссылка">
              <input
                className="playsay-input"
                disabled={disabled}
                onChange={(event) => onUpdate({ url: event.target.value })}
                placeholder="https://..."
                value={block.url ?? ""}
              />
            </FormField>
          </div>
        ) : null}

        {block.type === "image" || block.type === "generatedImage" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={block.type === "generatedImage" ? "Prompt" : "Ссылка на изображение"}>
              {block.type === "generatedImage" ? (
                <textarea
                  className="playsay-input min-h-20 resize-y py-3"
                  disabled={disabled}
                  onChange={(event) => onUpdate({ prompt: event.target.value })}
                  placeholder="friendly classroom picture"
                  value={block.prompt ?? ""}
                />
              ) : (
                <input
                  className="playsay-input"
                  disabled={disabled}
                  onChange={(event) => onUpdate({ url: event.target.value })}
                  placeholder="https://..."
                  value={block.url ?? ""}
                />
              )}
            </FormField>
            <FormField label="Подпись">
              <textarea
                className="playsay-input min-h-20 resize-y py-3"
                disabled={disabled}
                onChange={(event) => onUpdate({ caption: event.target.value })}
                value={block.caption ?? ""}
              />
            </FormField>
          </div>
        ) : null}

        {block.type === "flashcards" ? (
          <textarea
            className="playsay-input min-h-28 resize-y py-3"
            disabled={disabled}
            onChange={(event) => {
              const value = event.target.value;
              setFlashcardsSource(value);
              onUpdate({ cards: parseFlashcards(value, block.cards) });
            }}
            value={flashcardsSource}
          />
        ) : null}

        {block.type === "fillGaps" || block.type === "multipleChoice" ? (
          <textarea
            className="playsay-input min-h-28 resize-y py-3"
            disabled={disabled}
            onChange={(event) => {
              const value = event.target.value;
              setExerciseSource(value);
              onUpdate({ items: parseExerciseItems(value, exerciseType) });
            }}
            value={exerciseSource}
          />
        ) : null}

        {block.type === "matchingPairs" ? (
          <MatchingPairsEditor
            assetLibrary={assetLibrary}
            block={block}
            currentMaterialId={currentMaterialId}
            disabled={disabled}
            onUpdate={onUpdate}
          />
        ) : null}

        {isObjectiveMaterialBlockType(block.type) ? (
          <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-4">
            <FormField label="Вес">
              <input
                className="playsay-input"
                disabled={disabled}
                min={0.1}
                onChange={(event) => onUpdate({ assessment: { ...defaultObjectiveAssessmentPolicy(), ...block.assessment, weight: Number(event.target.value) } })}
                step={0.1}
                type="number"
                value={block.assessment?.weight ?? 1}
              />
            </FormField>
            <FormField label="Попытки">
              <input
                className="playsay-input"
                disabled={disabled}
                min={1}
                max={10}
                onChange={(event) => onUpdate({ assessment: { ...defaultObjectiveAssessmentPolicy(), ...block.assessment, maxAttempts: Number(event.target.value) } })}
                type="number"
                value={block.assessment?.maxAttempts ?? 3}
              />
            </FormField>
            <FormField label="Штраф за попытку">
              <input
                className="playsay-input"
                disabled={disabled}
                min={0}
                max={1}
                onChange={(event) => onUpdate({ assessment: { ...defaultObjectiveAssessmentPolicy(), ...block.assessment, attemptPenalty: Number(event.target.value) } })}
                step={0.05}
                type="number"
                value={block.assessment?.attemptPenalty ?? 0.3}
              />
            </FormField>
            <FormField label="Штраф за hint">
              <input
                className="playsay-input"
                disabled={disabled}
                min={0}
                max={1}
                onChange={(event) => onUpdate({ assessment: { ...defaultObjectiveAssessmentPolicy(), ...block.assessment, hintPenalty: Number(event.target.value) } })}
                step={0.05}
                type="number"
                value={block.assessment?.hintPenalty ?? 0.15}
              />
            </FormField>
          </div>
        ) : null}

        {block.type === "text" || block.type === "freeWriting" || block.type === "speakingPrompt" ? (
          <textarea
            className="playsay-input min-h-28 resize-y py-3"
            disabled={disabled}
            onChange={(event) => onUpdate(block.type === "text" ? { body: event.target.value } : { prompt: event.target.value })}
            value={block.type === "text" ? block.body ?? "" : block.prompt ?? ""}
          />
        ) : null}

        {block.type === "drawingArea" ? (
          <FormField label="Высота области">
            <input
              className="playsay-input"
              disabled={disabled}
              max={800}
              min={120}
              onChange={(event) => onUpdate({ height: Number(event.target.value) })}
              type="number"
              value={block.height ?? 240}
            />
          </FormField>
        ) : null}
      </div>
    </article>
  );
}

function MatchingPairsEditor({
  assetLibrary,
  block,
  currentMaterialId,
  disabled,
  onUpdate,
}: {
  assetLibrary: MaterialAssetLibraryItem[];
  block: MaterialEditorBlock;
  currentMaterialId: string | null;
  disabled: boolean;
  onUpdate: (patch: Partial<MaterialEditorBlock>) => void;
}) {
  const draftRowsRef = useRef<MaterialMatchingPair[]>([
    emptyMatchingPair(),
    emptyMatchingPair(),
  ]);
  const [assetQueries, setAssetQueries] = useState<Record<string, string>>({});
  const pairs = editableMatchingPairs(block.pairs ?? [], draftRowsRef.current);

  function updatePairs(nextPairs: MaterialMatchingPair[]) {
    onUpdate({ pairs: nextPairs });
  }

  function updatePair(pairId: string, patch: Partial<MaterialMatchingPair>) {
    updatePairs(pairs.map((pair) => (pair.id === pairId ? { ...pair, ...patch } : pair)));
  }

  function toggleImage(pair: MaterialMatchingPair, checked: boolean) {
    if (checked) {
      const imageAlt = pair.right.trim() || pair.left.trim();
      updatePair(pair.id, {
        targetKind: "IMAGE",
        imageAlt: imageAlt || undefined,
        imagePrompt: pair.imagePrompt?.trim() || (imageAlt ? defaultMatchingImagePrompt(imageAlt) : ""),
      });
      return;
    }

    updatePair(pair.id, {
      targetKind: "TEXT",
      imagePrompt: undefined,
      imageAlt: undefined,
      imageUrl: undefined,
    });
  }

  function chooseAsset(pair: MaterialMatchingPair, item: MaterialAssetLibraryItem) {
    const nextRight = pair.right.trim() || item.alt || item.tags[0] || item.materialTitle;
    const imageUrl = currentMaterialId && currentMaterialId === item.materialId
      ? `material-asset:${item.asset.id}`
      : undefined;

    updatePair(pair.id, {
      right: nextRight,
      targetKind: "IMAGE",
      imageAlt: nextRight,
      imagePrompt: item.prompt || pair.imagePrompt || defaultMatchingImagePrompt(nextRight || pair.left),
      imageUrl,
    });
  }

  function addRow() {
    updatePairs([...pairs, emptyMatchingPair()]);
  }

  function removeRow(pairId: string) {
    updatePairs(editableMatchingPairs(pairs.filter((pair) => pair.id !== pairId), []));
  }

  return (
    <div className="playsay-matching-editor">
      <div className="playsay-matching-editor-head" aria-hidden="true">
        <span>Слева</span>
        <span>Справа</span>
        <span />
      </div>
      {pairs.map((pair, index) => {
        const isImage = materialMatchingPairTargetKind(pair) === "IMAGE";
        const assetQuery = assetQueries[pair.id] ?? "";
        const assetResults = isImage ? matchingAssetSearchResults(assetLibrary, assetQuery).slice(0, 5) : [];
        return (
          <div className="playsay-matching-editor-row" key={pair.id}>
            <input
              aria-label={`Слева ${index + 1}`}
              className="playsay-input"
              disabled={disabled}
              maxLength={240}
              onChange={(event) => updatePair(pair.id, { left: event.target.value })}
              placeholder="слово / фраза"
              value={pair.left}
            />
            <input
              aria-label={`Справа ${index + 1}`}
              className="playsay-input"
              disabled={disabled}
              maxLength={240}
              onChange={(event) => {
                const value = event.target.value;
                updatePair(pair.id, {
                  right: value,
                  imageAlt: isImage ? value : undefined,
                });
              }}
              placeholder={isImage ? "что на картинке" : "ответ / перевод"}
              value={pair.right}
            />
            <div className="playsay-matching-row-tools">
              <label className="playsay-image-checkbox">
                <input
                  checked={isImage}
                  disabled={disabled}
                  onChange={(event) => toggleImage(pair, event.target.checked)}
                  type="checkbox"
                />
                <span>image</span>
              </label>
              <Button
                aria-label="Удалить строку"
                disabled={disabled || pairs.length <= 2}
                onClick={() => removeRow(pair.id)}
                type="button"
                variant="outline"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {isImage ? (
              <div className="playsay-matching-image-fields">
                <input
                  aria-label={`Поиск картинки по тегу ${index + 1}`}
                  className="playsay-input"
                  disabled={disabled}
                  maxLength={80}
                  onChange={(event) => setAssetQueries((current) => ({ ...current, [pair.id]: event.target.value }))}
                  placeholder="поиск существующей картинки по тегу"
                  value={assetQuery}
                />
                {assetQuery.trim() ? (
                  <div className="playsay-matching-asset-results">
                    {assetResults.length > 0 ? (
                      assetResults.map((item) => (
                        <button
                          className="playsay-matching-asset-chip"
                          disabled={disabled}
                          key={`${item.materialId}:${item.asset.id}`}
                          onClick={() => chooseAsset(pair, item)}
                          type="button"
                        >
                          <span>{item.alt || item.prompt || "AI image"}</span>
                          <small>
                            {currentMaterialId === item.materialId ? "asset" : "prompt"} · {item.tags.slice(0, 3).join(", ") || item.materialTitle}
                          </small>
                        </button>
                      ))
                    ) : (
                      <span className="playsay-matching-asset-empty">Нет картинок с таким тегом</span>
                    )}
                  </div>
                ) : null}
                <textarea
                  aria-label={`Prompt картинки ${index + 1}`}
                  className="playsay-input min-h-20 resize-y py-3"
                  disabled={disabled}
                  maxLength={1_000}
                  onChange={(event) => updatePair(pair.id, {
                    imagePrompt: event.target.value,
                    imageUrl: undefined,
                  })}
                  placeholder="prompt для AI-картинки без текста внутри"
                  value={pair.imagePrompt ?? ""}
                />
              </div>
            ) : null}
          </div>
        );
      })}
      <Button disabled={disabled} onClick={addRow} type="button" variant="outline">
        <Plus className="h-4 w-4" />
        Добавить строку
      </Button>
    </div>
  );
}
