import type { ReactNode } from "react";
import { BookOpen, Bot, CheckCircle2, FileText, ImageIcon, Layers3, Link2, MousePointer2, PenLine, Users, Video } from "lucide-react";
import type { CourseLessonMap } from "../../../entities/schedule/model";
import type {
  Course,
  CourseLesson,
  LessonMaterial,
  LessonMaterialAsset,
  LessonMaterialDraft,
  LessonMaterialInput,
  LessonMaterialJson,
  LessonMaterialSubmission,
} from "../../../shared/api/playsay";
import { parseOptionalNumber } from "../../../shared/utils/number";

export type MaterialBlockType =
  | "text"
  | "image"
  | "videoEmbed"
  | "flashcards"
  | "fillGaps"
  | "multipleChoice"
  | "matchingPairs"
  | "freeWriting"
  | "speakingPrompt"
  | "drawingArea"
  | "generatedImage";

export type MaterialMatchingTargetKind = "TEXT" | "IMAGE";

export type MaterialMatchingPair = {
  id: string;
  left: string;
  right: string;
  targetKind?: MaterialMatchingTargetKind;
  imagePrompt?: string;
  imageAlt?: string;
  imageUrl?: string;
};

export type MaterialImageGenerationProgress = {
  current?: number;
  label: string;
  total: number;
};

export type MaterialAssetLibraryItem = {
  alt: string;
  asset: LessonMaterialAsset;
  materialId: string;
  materialTitle: string;
  prompt: string;
  searchText: string;
  tags: string[];
};

export type MaterialVideoEmbedFrame = {
  src: string;
  title: string;
};

export type MaterialAssessmentPolicy = {
  weight?: number;
  maxAttempts?: number;
  attemptPenalty?: number;
  hintPenalty?: number;
  lockAfterAttempts?: boolean;
};

export type MaterialAttemptEntry = {
  at: string;
  correct?: boolean;
  value: string;
};

export type MaterialHintEntry = {
  at: string;
  label: string;
  penalty: number;
  type: string;
  value?: string;
};

export type MaterialAnswerStatus = {
  attemptsUsed: number;
  correct: boolean;
  icon: typeof CheckCircle2;
  incorrectAttempts: number;
  hintsUsed: number;
  kind: "empty" | "draft" | "correct" | "retry" | "hint" | "wrong" | "locked";
  label: string;
  locked: boolean;
  maxAttempts: number;
};

export type MaterialEditorBlock = {
  id: string;
  type: MaterialBlockType;
  title: string;
  assessment?: MaterialAssessmentPolicy;
  body?: string;
  prompt?: string;
  url?: string;
  provider?: string;
  caption?: string;
  cards?: Array<{ id: string; front: string; back: string; example?: string }>;
  items?: Array<{ prompt: string; answer?: string; options?: string[]; weight?: number }>;
  pairs?: MaterialMatchingPair[];
  height?: number;
};

export const MAX_MANUAL_INPUT_HINTS = 3;
export const emptyMaterialMatchingPairs: MaterialMatchingPair[] = [];

export type MaterialExerciseItem = NonNullable<MaterialEditorBlock["items"]>[number];

export type MaterialEditorPage = {
  id: string;
  title: string;
  layout: "FLOW" | "WORKSHEET";
  blocks: MaterialEditorBlock[];
};

export type MaterialEditorDocument = {
  schemaVersion: 1;
  pages: MaterialEditorPage[];
};

export type MaterialRenderMode = "classroom" | "teacherPreview";
export type MaterialAuthorMode = "preview" | "edit";
export type MaterialAnswerBlock = Record<string, unknown>;
export type MaterialAnswerState = Record<string, MaterialAnswerBlock>;

export type MaterialFormState = {
  id: string | null;
  updatedAt: string | null;
  title: string;
  description: string;
  language: string;
  cefrLevel: string;
  visibility: "PRIVATE" | "PUBLIC";
  status: "DRAFT" | "PUBLISHED";
  sourcePrompt: string;
  document: MaterialEditorDocument;
  scoringRubric: LessonMaterialJson;
  sourceMeta: LessonMaterialJson;
};

export type MaterialDraftSourceImage = {
  dataUrl: string;
  fileName: string;
  originalSize: number;
};

export function uniqueMaterialOptions(options: string[]): string[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = normalizeMaterialAnswer(option);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function uniqueMaterialTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.reduce<string[]>((result, tag) => {
    const normalized = normalizeMaterialTag(tag);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return result;
    }
    seen.add(key);
    return [...result, normalized];
  }, []);
}

export function normalizeMaterialTag(value: string): string {
  return value.trim().replace(/^#/, "").replace(/\s+/g, "-").slice(0, 32);
}

export function normalizeMaterialAnswer(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

export function defaultMaterialForm(): MaterialFormState {
  return {
    id: null,
    updatedAt: null,
    title: "",
    description: "",
    language: "en",
    cefrLevel: "A2",
    visibility: "PRIVATE",
    status: "DRAFT",
    sourcePrompt: "",
    document: defaultMaterialDocument(),
    scoringRubric: {
      scale: 10,
      maxScore: 10,
      criteria: [
        { id: "accuracy", title: "Accuracy", maxScore: 4 },
        { id: "fluency", title: "Fluency", maxScore: 3 },
        { id: "task", title: "Task completion", maxScore: 3 },
      ],
    },
    sourceMeta: {
      kind: "MANUAL",
      prompt: "",
    },
  };
}

export function defaultMaterialDocument(title = "Новый материал"): MaterialEditorDocument {
  return {
    schemaVersion: 1,
    pages: [defaultMaterialPage(title)],
  };
}

export function defaultMaterialPage(title = "Новый материал"): MaterialEditorPage {
  return {
    id: createClientId("page"),
    title,
    layout: "FLOW",
    blocks: [
      {
        id: createClientId("block"),
        type: "text",
        title: "Цель урока",
        body: "Добавьте короткую инструкцию, упражнение, видео или карточки.",
      },
    ],
  };
}

export function newMaterialBlock(type: MaterialBlockType): MaterialEditorBlock {
  const base = {
    id: createClientId("block"),
    type,
    title: materialBlockLabel(type),
  };

  switch (type) {
    case "videoEmbed":
      return { ...base, provider: "YOUTUBE", url: "" };
    case "image":
      return { ...base, caption: "", url: "" };
    case "generatedImage":
      return { ...base, caption: "", prompt: "" };
    case "flashcards":
      return {
        ...base,
        cards: [
          { id: createClientId("card"), front: "boarding pass", back: "посадочный талон", example: "Show your boarding pass at the gate." },
        ],
      };
    case "fillGaps":
      return {
        ...base,
        assessment: defaultObjectiveAssessmentPolicy(),
        items: [{ prompt: "I am ___ the airport.", answer: "at" }],
      };
    case "multipleChoice":
      return {
        ...base,
        assessment: defaultObjectiveAssessmentPolicy(),
        items: [{ prompt: "Choose the correct answer.", answer: "at", options: ["at", "in", "on"] }],
      };
    case "matchingPairs":
      return {
        ...base,
        assessment: defaultObjectiveAssessmentPolicy(),
        pairs: [
          emptyMatchingPair(),
          emptyMatchingPair(),
        ],
      };
    case "freeWriting":
      return { ...base, prompt: "Write 3-5 sentences." };
    case "speakingPrompt":
      return { ...base, prompt: "Discuss the questions with your teacher." };
    case "drawingArea":
      return { ...base, height: 240 };
    case "text":
    default:
      return { ...base, body: "Введите текст задания." };
  }
}

export function defaultObjectiveAssessmentPolicy(): MaterialAssessmentPolicy {
  return {
    weight: 1,
    maxAttempts: 3,
    attemptPenalty: 0.3,
    hintPenalty: 0.15,
    lockAfterAttempts: true,
  };
}

export function emptyMatchingPair(): MaterialMatchingPair {
  return {
    id: createClientId("pair"),
    left: "",
    right: "",
    targetKind: "TEXT",
  };
}

export function editableMatchingPairs(
  pairs: MaterialMatchingPair[],
  draftRows: MaterialMatchingPair[] = [],
): MaterialMatchingPair[] {
  const next = [...pairs];
  let draftIndex = 0;

  while (next.length < 2) {
    next.push(draftRows[draftIndex] ?? emptyMatchingPair());
    draftIndex += 1;
  }

  return next;
}

export function defaultMatchingImagePrompt(value: string): string {
  const subject = value.trim() || "the target word";
  return `child-friendly workbook illustration of ${subject}, white background, no text`;
}

export async function prepareMaterialDraftSourceImage(file: File): Promise<MaterialDraftSourceImage> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Поддерживаются JPEG, PNG и WebP.");
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("Изображение должно быть меньше 12 МБ.");
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const image = await loadHtmlImage(rawDataUrl);
  const maxSide = 1400;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Браузер не смог подготовить изображение.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.84;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > 2_400_000 && quality > 0.58) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  if (dataUrl.length > 2_400_000) {
    throw new Error("Изображение слишком большое после сжатия. Попробуйте обрезать фото ближе к заданию.");
  }

  return {
    dataUrl,
    fileName: file.name || "worksheet.jpg",
    originalSize: file.size,
  };
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (result) {
        resolve(result);
      } else {
        reject(new Error("Не удалось прочитать файл."));
      }
    };
    reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
    reader.readAsDataURL(file);
  });
}

export function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось открыть изображение."));
    image.src = src;
  });
}

export function materialToForm(material: LessonMaterial): MaterialFormState {
  const sourceMeta = asJsonObject(material.sourceMeta);

  return {
    id: material.id,
    updatedAt: material.updatedAt,
    title: material.title,
    description: material.description ?? "",
    language: material.language || "en",
    cefrLevel: material.cefrLevel || "A2",
    visibility: material.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE",
    status: material.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    sourcePrompt: readPromptFromSourceMeta(material.sourceMeta),
    document: editorDocumentFromJson(material.document, material.title),
    scoringRubric: asJsonObject(material.scoringRubric),
    sourceMeta,
  };
}

export function materialDraftToForm(draft: LessonMaterialDraft): MaterialFormState {
  const sourceMeta = asJsonObject(draft.sourceMeta);

  return {
    id: null,
    updatedAt: null,
    title: draft.title,
    description: draft.description ?? "",
    language: draft.language || "en",
    cefrLevel: draft.cefrLevel || "A2",
    visibility: draft.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE",
    status: draft.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    sourcePrompt: readPromptFromSourceMeta(sourceMeta),
    document: editorDocumentFromJson(draft.document, draft.title),
    scoringRubric: asJsonObject(draft.scoringRubric),
    sourceMeta,
  };
}

export function duplicateMaterialForm(form: MaterialFormState): MaterialFormState {
  const sourceMeta = {
    ...asJsonObject(form.sourceMeta),
    duplicatedFromMaterialId: form.id,
  };

  return {
    ...form,
    id: null,
    updatedAt: null,
    title: form.title.trim() ? `Копия ${form.title.trim()}` : "Копия материала",
    visibility: "PRIVATE",
    status: "DRAFT",
    document: cloneMaterialDocument(form.document),
    sourceMeta,
  };
}

export function materialFormWithBlockPatch(
  form: MaterialFormState,
  blockId: string,
  patch: Partial<MaterialEditorBlock>,
): MaterialFormState {
  return {
    ...form,
    document: {
      ...form.document,
      pages: form.document.pages.map((page) => ({
        ...page,
        blocks: page.blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block)),
      })),
    },
  };
}

export function cloneMaterialDocument(document: MaterialEditorDocument): MaterialEditorDocument {
  return {
    schemaVersion: 1,
    pages: document.pages.map((page) => ({
      ...page,
      id: createClientId("page"),
      blocks: page.blocks.map(cloneMaterialBlock),
    })),
  };
}

export function cloneMaterialBlock(block: MaterialEditorBlock): MaterialEditorBlock {
  return {
    ...block,
    id: createClientId("block"),
    cards: block.cards?.map((card) => ({
      ...card,
      id: createClientId("card"),
    })),
    items: block.items?.map((item) => ({ ...item })),
    pairs: block.pairs?.map((pair) => ({
      ...pair,
      id: createClientId("pair"),
    })),
  };
}

export function materialFormToInput(form: MaterialFormState): LessonMaterialInput {
  const title = form.title.trim();
  const sourceMeta = {
    ...asJsonObject(form.sourceMeta),
    prompt: form.sourcePrompt.trim(),
  };

  return {
    title,
    description: form.description.trim() || null,
    language: form.language.trim() || "en",
    cefrLevel: form.cefrLevel,
    visibility: form.visibility,
    status: form.status,
    document: {
      ...form.document,
      pages: form.document.pages.map((page) => ({
        ...page,
        title: page.title.trim() || title,
        blocks: page.blocks.map((block) => cleanMaterialBlock(block)),
      })),
    } as unknown as LessonMaterialJson,
    sourceMeta,
    scoringRubric: form.scoringRubric,
  };
}

export function materialPreviewFromForm(form: MaterialFormState): LessonMaterial {
  const input = materialFormToInput({
    ...form,
    title: form.title.trim() || "Новый материал",
  });
  const now = form.updatedAt ?? new Date().toISOString();

  return {
    id: form.id ?? "preview",
    ownerTeacherUserId: null,
    ownerTeacherSubject: null,
    ownerTeacherName: null,
    title: input.title,
    description: input.description ?? null,
    language: input.language ?? "en",
    cefrLevel: input.cefrLevel ?? "A2",
    visibility: input.visibility ?? "PRIVATE",
    status: input.status ?? "DRAFT",
    document: input.document ?? {},
    sourceMeta: input.sourceMeta ?? {},
    scoringRubric: input.scoringRubric ?? {},
    blockCount: form.document.pages.reduce((count, page) => count + page.blocks.length, 0),
    createdAt: now,
    updatedAt: now,
  };
}

export function editorDocumentFromJson(value: LessonMaterialJson | unknown, fallbackTitle = "Материал"): MaterialEditorDocument {
  const root = asJsonObject(value);
  const rawPages = Array.isArray(root.pages) ? root.pages : [];
  const pages = rawPages
    .map((page, index) => materialPageFromJson(page, index, fallbackTitle))
    .filter((page): page is MaterialEditorPage => page !== null);

  if (pages.length === 0) {
    return defaultMaterialDocument(fallbackTitle);
  }

  return {
    schemaVersion: 1,
    pages,
  };
}

export function materialPageFromJson(value: unknown, index: number, fallbackTitle: string): MaterialEditorPage | null {
  const page = asJsonObject(value);
  const rawBlocks = Array.isArray(page.blocks) ? page.blocks : [];
  const blocks = rawBlocks
    .map((block) => materialBlockFromJson(block))
    .filter((block): block is MaterialEditorBlock => block !== null);

  return {
    id: asString(page.id) || createClientId("page"),
    title: asString(page.title) || (index === 0 ? fallbackTitle : `Страница ${index + 1}`),
    layout: page.layout === "WORKSHEET" ? "WORKSHEET" : "FLOW",
    blocks,
  };
}

export function materialBlockFromJson(value: unknown): MaterialEditorBlock | null {
  const block = asJsonObject(value);
  const type = normalizeMaterialBlockType(asString(block.type));
  if (!type) {
    return null;
  }

  const result: MaterialEditorBlock = {
    id: asString(block.id) || createClientId("block"),
    type,
    title: asString(block.title) || materialBlockLabel(type),
  };
  const assessment = materialAssessmentFromJson(block.assessment);
  if (assessment || isObjectiveMaterialBlockType(type)) {
    result.assessment = assessment ?? defaultObjectiveAssessmentPolicy();
  }

  const body = asString(block.body);
  const prompt = asString(block.prompt);
  const url = asString(block.url);
  const provider = asString(block.provider);
  const caption = asString(block.caption);
  const height = asNumber(block.height);

  if (body) {
    result.body = body;
  }
  if (prompt) {
    result.prompt = prompt;
  }
  if (url) {
    result.url = url;
  }
  if (provider) {
    result.provider = provider;
  }
  if (caption) {
    result.caption = caption;
  }
  if (height !== null) {
    result.height = Math.min(800, Math.max(120, height));
  }

  if (Array.isArray(block.cards)) {
    result.cards = block.cards.map(materialCardFromJson).filter((card): card is NonNullable<MaterialEditorBlock["cards"]>[number] => card !== null);
  }

  if (Array.isArray(block.items)) {
    result.items = block.items.map(materialItemFromJson).filter((item): item is NonNullable<MaterialEditorBlock["items"]>[number] => item !== null);
  }

  if (Array.isArray(block.pairs)) {
    result.pairs = block.pairs.map(materialMatchingPairFromJson).filter((pair): pair is MaterialMatchingPair => pair !== null);
  } else if (type === "matchingPairs" && Array.isArray(block.items)) {
    result.pairs = block.items.map(materialMatchingPairFromJson).filter((pair): pair is MaterialMatchingPair => pair !== null);
  }

  return result;
}

export function cleanMaterialBlock(block: MaterialEditorBlock): MaterialEditorBlock {
  const title = block.title.trim() || materialBlockLabel(block.type);
  const clean: MaterialEditorBlock = {
    id: block.id || createClientId("block"),
    type: block.type,
    title,
  };
  if (block.assessment || isObjectiveMaterialBlockType(block.type)) {
    clean.assessment = cleanMaterialAssessment(block.assessment ?? defaultObjectiveAssessmentPolicy());
  }

  if (block.body?.trim()) {
    clean.body = block.body.trim();
  }
  if (block.prompt?.trim()) {
    clean.prompt = block.prompt.trim();
  }
  if (block.url?.trim()) {
    clean.url = block.url.trim();
  }
  if (block.provider?.trim()) {
    clean.provider = block.provider.trim();
  }
  if (block.caption?.trim()) {
    clean.caption = block.caption.trim();
  }
  if (block.height) {
    clean.height = Math.min(800, Math.max(120, block.height));
  }
  if (block.cards?.length) {
    clean.cards = block.cards
      .filter((card) => card.front.trim() || card.back.trim())
      .map((card) => ({
        id: card.id || createClientId("card"),
        front: card.front.trim(),
        back: card.back.trim(),
        example: card.example?.trim() || undefined,
      }));
  }
  if (block.items?.length) {
    clean.items = block.items
      .filter((item) => item.prompt.trim())
      .map((item) => ({
        prompt: item.prompt.trim(),
        answer: item.answer?.trim() || undefined,
        options: item.options?.map((option) => option.trim()).filter(Boolean),
        weight: item.weight && item.weight > 0 ? item.weight : undefined,
      }));
  }
  if (block.pairs?.length) {
    clean.pairs = block.pairs
      .filter((pair) => pair.left.trim() && pair.right.trim())
      .map((pair) => {
        const right = pair.right.trim();
        const targetKind = materialMatchingPairTargetKind(pair);
        const cleanPair: MaterialMatchingPair = {
          id: pair.id || createClientId("pair"),
          left: pair.left.trim(),
          right,
          targetKind,
        };
        if (targetKind === "IMAGE") {
          cleanPair.imagePrompt = pair.imagePrompt?.trim() || `child-friendly workbook illustration of ${right}, white background`;
          cleanPair.imageAlt = pair.imageAlt?.trim() || right;
          cleanPair.imageUrl = pair.imageUrl?.trim() || undefined;
        }
        return cleanPair;
      });
  }

  return clean;
}

export function materialCardFromJson(value: unknown): NonNullable<MaterialEditorBlock["cards"]>[number] | null {
  const card = asJsonObject(value);
  const front = asString(card.front);
  const back = asString(card.back);
  if (!front && !back) {
    return null;
  }

  return {
    id: asString(card.id) || createClientId("card"),
    front,
    back,
    example: asString(card.example) || undefined,
  };
}

export function materialItemFromJson(value: unknown): NonNullable<MaterialEditorBlock["items"]>[number] | null {
  const item = asJsonObject(value);
  const prompt = asString(item.prompt);
  if (!prompt) {
    return null;
  }
  const options = Array.isArray(item.options) ? item.options.map(asString).filter(Boolean) : [];
  const choices = Array.isArray(item.choices) ? item.choices.map(asString).filter(Boolean) : [];

  return {
    prompt,
    answer: asString(item.answer) || asString(item.correct) || undefined,
    options: uniqueMaterialOptions([...options, ...choices]),
    weight: asPositiveNumber(item.weight) ?? asPositiveNumber(asJsonObject(item.assessment).weight) ?? undefined,
  };
}

export function materialAssessmentFromJson(value: unknown): MaterialAssessmentPolicy | undefined {
  const assessment = asJsonObject(value);
  if (Object.keys(assessment).length === 0) {
    return undefined;
  }
  return cleanMaterialAssessment({
    weight: asPositiveNumber(assessment.weight) ?? undefined,
    maxAttempts: asPositiveNumber(assessment.maxAttempts) ?? undefined,
    attemptPenalty: asNumber(assessment.attemptPenalty) ?? undefined,
    hintPenalty: asNumber(assessment.hintPenalty) ?? undefined,
    lockAfterAttempts: typeof assessment.lockAfterAttempts === "boolean" ? assessment.lockAfterAttempts : undefined,
  });
}

export function cleanMaterialAssessment(value: MaterialAssessmentPolicy): MaterialAssessmentPolicy {
  return {
    weight: clampNumber(value.weight ?? 1, 0.1, 20),
    maxAttempts: Math.round(clampNumber(value.maxAttempts ?? 3, 1, 10)),
    attemptPenalty: clampNumber(value.attemptPenalty ?? 0.3, 0, 1),
    hintPenalty: clampNumber(value.hintPenalty ?? 0.15, 0, 1),
    lockAfterAttempts: value.lockAfterAttempts ?? true,
  };
}

export function materialMatchingPairFromJson(value: unknown): MaterialMatchingPair | null {
  const pair = asJsonObject(value);
  const left = asString(pair.left) || asString(pair.word) || asString(pair.prompt);
  const right = asString(pair.right) || asString(pair.target) || asString(pair.answer) || asString(pair.correct) || left;
  if (!left || !right) {
    return null;
  }
  const imagePrompt = asString(pair.imagePrompt) || asString(pair.promptForImage) || asString(pair.generatedImagePrompt) || undefined;
  const imageAlt = asString(pair.imageAlt) || asString(pair.alt) || undefined;
  const imageUrl = asString(pair.imageUrl) || asString(pair.url) || undefined;
  const targetKind = normalizeMatchingTargetKind(asString(pair.targetKind) || asString(pair.kind) || asString(pair.mediaKind)) ??
    (imagePrompt || imageAlt || imageUrl ? "IMAGE" : "TEXT");

  return {
    id: asString(pair.id) || createClientId("pair"),
    left,
    right,
    targetKind,
    imagePrompt: targetKind === "IMAGE" ? imagePrompt : undefined,
    imageAlt: targetKind === "IMAGE" ? imageAlt ?? right : undefined,
    imageUrl: targetKind === "IMAGE" ? imageUrl : undefined,
  };
}

export function materialMatchingPairTargetKind(pair: MaterialMatchingPair): MaterialMatchingTargetKind {
  return pair.targetKind ?? (pair.imagePrompt?.trim() || pair.imageAlt?.trim() || pair.imageUrl?.trim() ? "IMAGE" : "TEXT");
}

export function normalizeMatchingTargetKind(value: string): MaterialMatchingTargetKind | null {
  const clean = value.trim().toLowerCase();
  if (["image", "img", "picture", "photo", "картинка", "рисунок", "изображение"].includes(clean)) {
    return "IMAGE";
  }
  if (["text", "word", "label", "текст", "слово", "надпись"].includes(clean)) {
    return "TEXT";
  }
  return null;
}

export function materialDocumentAssetIds(document: MaterialEditorDocument): string[] {
  const ids = new Set<string>();
  document.pages.forEach((page) => {
    page.blocks.forEach((block) => {
      (block.pairs ?? []).forEach((pair) => {
        const assetId = materialAssetIdFromUrl(pair.imageUrl);
        if (assetId) {
          ids.add(assetId);
        }
      });
      const blockAssetId = materialAssetIdFromUrl(block.url);
      if (blockAssetId) {
        ids.add(blockAssetId);
      }
    });
  });
  return [...ids].sort();
}

export function materialAssetLibraryItemFromAsset(material: LessonMaterial, asset: LessonMaterialAsset): MaterialAssetLibraryItem | null {
  if (asset.kind !== "GENERATED_IMAGE") {
    return null;
  }

  const metadata = asJsonObject(asset.metadata);
  const tags = materialAssetTags(metadata);
  const prompt = asString(metadata.sourcePrompt) || asString(metadata.prompt);
  const alt = asString(metadata.sourceAlt) || asString(metadata.alt) || asString(metadata.title);
  const searchText = [
    material.title,
    asset.kind,
    prompt,
    alt,
    tags.join(" "),
  ].join(" ").toLowerCase();

  return {
    alt,
    asset,
    materialId: material.id,
    materialTitle: material.title,
    prompt,
    searchText,
    tags,
  };
}

export function matchingAssetSearchResults(
  assetLibrary: MaterialAssetLibraryItem[],
  query: string,
): MaterialAssetLibraryItem[] {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) {
    return [];
  }

  return assetLibrary.filter((item) => terms.every((term) => item.searchText.includes(term)));
}

export function materialAssetTagsMap(assets: LessonMaterialAsset[]): Record<string, string[]> {
  return assets.reduce<Record<string, string[]>>((result, asset) => {
    const tags = materialAssetTags(asset.metadata);
    if (tags.length > 0) {
      result[asset.id] = tags;
    }
    return result;
  }, {});
}

export function materialAssetTags(metadataValue: LessonMaterialJson | unknown): string[] {
  const metadata = asJsonObject(metadataValue);
  return Array.isArray(metadata.tags)
    ? uniqueMaterialTags(metadata.tags.map(asString))
    : [];
}

export function materialAssetIdFromUrl(value: string | undefined): string | null {
  const marker = "material-asset:";
  const clean = value?.trim() ?? "";
  if (!clean.startsWith(marker)) {
    return null;
  }
  return clean.slice(marker.length).trim() || null;
}

export function resolveMaterialImageUrl(value: string | undefined, assetUrls: Record<string, string>): string | undefined {
  const assetId = materialAssetIdFromUrl(value);
  if (assetId) {
    return assetUrls[assetId];
  }
  return value?.trim() || undefined;
}

export function materialAnswersFromSubmission(submission: LessonMaterialSubmission | null): MaterialAnswerState {
  const content = asJsonObject(submission?.content);
  const answers = asJsonObject(content.answers);
  return Object.entries(answers).reduce<MaterialAnswerState>((result, [blockId, value]) => {
    const answer = asJsonObject(value);
    if (Object.keys(answer).length > 0) {
      result[blockId] = answer;
    }
    return result;
  }, {});
}

export function materialAnswerItems(answer: MaterialAnswerBlock | undefined): Record<string, string> {
  const items = asJsonObject(answer?.items);
  return Object.entries(items).reduce<Record<string, string>>((result, [key, value]) => {
    const itemValue = asString(value);
    if (itemValue) {
      result[key] = itemValue;
    }
    return result;
  }, {});
}

export function materialAnswerMatches(answer: MaterialAnswerBlock | undefined): Record<string, string> {
  const matches = asJsonObject(answer?.matches);
  return Object.entries(matches).reduce<Record<string, string>>((result, [key, value]) => {
    const matchValue = asString(value);
    if (matchValue) {
      result[key] = matchValue;
    }
    return result;
  }, {});
}

export function materialAnswerAttempts(answer: MaterialAnswerBlock | undefined): Record<string, MaterialAttemptEntry[]> {
  const attempts = asJsonObject(answer?.attempts);
  return Object.entries(attempts).reduce<Record<string, MaterialAttemptEntry[]>>((result, [key, value]) => {
    const rawAttempts = Array.isArray(value) ? value : [];
    const parsed = rawAttempts
      .map((entry) => {
        if (typeof entry === "string") {
          return { at: "", value: entry };
        }
        const object = asJsonObject(entry);
        const valueText = asString(object.value);
        if (!valueText) {
          return null;
        }
        return {
          at: asString(object.at),
          correct: typeof object.correct === "boolean" ? object.correct : undefined,
          value: valueText,
        };
      })
      .filter((entry): entry is MaterialAttemptEntry => entry !== null);
    if (parsed.length > 0) {
      result[key] = parsed;
    }
    return result;
  }, {});
}

export function materialAnswerHints(answer: MaterialAnswerBlock | undefined): Record<string, MaterialHintEntry[]> {
  const hints = asJsonObject(answer?.hints);
  return Object.entries(hints).reduce<Record<string, MaterialHintEntry[]>>((result, [key, value]) => {
    const rawHints = Array.isArray(value) ? value : [];
    const parsed = rawHints
      .map((entry) => {
        const object = asJsonObject(entry);
        const type = asString(object.type) || "hint";
        const label = asString(object.label) || asString(object.value);
        if (!label) {
          return null;
        }
        const hintEntry: MaterialHintEntry = {
          at: asString(object.at),
          label,
          penalty: asNumber(object.penalty) ?? 0.15,
          type,
        };
        const hintValue = asString(object.value);
        if (hintValue) {
          hintEntry.value = hintValue;
        }
        return hintEntry;
      })
      .filter((entry): entry is MaterialHintEntry => entry !== null);
    if (parsed.length > 0) {
      result[key] = parsed;
    }
    return result;
  }, {});
}

export function materialAnswerText(answer: MaterialAnswerBlock | undefined): string {
  return asString(answer?.text);
}

export function materialDocumentBlocks(material: LessonMaterial): MaterialEditorBlock[] {
  return editorDocumentFromJson(material.document, material.title).pages.flatMap((page) => page.blocks);
}

export function countPendingMaterialImageTargets(
  document: MaterialEditorDocument,
  assets: LessonMaterialAsset[] = [],
): number {
  const assetsById = materialAssetsById(assets);
  return document.pages.reduce((total, page) => (
    total + page.blocks.reduce((pageTotal, block) => {
      if (
        block.type === "generatedImage" &&
        materialImagePromptNeedsGeneration(block.url, block.prompt, assetsById)
      ) {
        return pageTotal + 1;
      }

      if (block.type !== "matchingPairs") {
        return pageTotal;
      }

      return pageTotal + (block.pairs ?? []).filter((pair) => (
        materialMatchingPairTargetKind(pair) === "IMAGE" &&
        materialImagePromptNeedsGeneration(pair.imageUrl, pair.imagePrompt, assetsById)
      )).length;
    }, 0)
  ), 0);
}

export function materialAssetsById(assets: LessonMaterialAsset[]): Record<string, LessonMaterialAsset> {
  return assets.reduce<Record<string, LessonMaterialAsset>>((result, asset) => {
    result[asset.id] = asset;
    return result;
  }, {});
}

export function materialImagePromptNeedsGeneration(
  imageUrl: string | undefined,
  prompt: string | undefined,
  assetsById: Record<string, LessonMaterialAsset>,
): boolean {
  const cleanPrompt = normalizeMaterialImagePrompt(prompt);
  if (!cleanPrompt) {
    return false;
  }

  const cleanUrl = imageUrl?.trim() ?? "";
  if (!cleanUrl) {
    return true;
  }

  const assetId = materialAssetIdFromUrl(cleanUrl);
  if (!assetId) {
    return false;
  }

  const asset = assetsById[assetId];
  if (!asset) {
    return true;
  }
  if (asset.kind !== "GENERATED_IMAGE") {
    return false;
  }

  return normalizeMaterialImagePrompt(materialAssetSourcePrompt(asset)) !== cleanPrompt;
}

export function materialAssetSourcePrompt(asset: LessonMaterialAsset): string {
  const metadata = asJsonObject(asset.metadata);
  return asString(metadata.sourcePrompt) ||
    asString(metadata.prompt).split("\n\nCreate a new original illustration")[0];
}

export function normalizeMaterialImagePrompt(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

export function materialMaxScore(rubric: LessonMaterialJson): number {
  const object = asJsonObject(rubric);
  const maxScore = asNumber(object.maxScore);
  if (maxScore !== null) {
    return maxScore;
  }

  const scale = asNumber(object.scale);
  return scale ?? 10;
}

export function readPromptFromSourceMeta(value: LessonMaterialJson | unknown): string {
  const sourceMeta = asJsonObject(value);
  return asString(sourceMeta.prompt) || asString(sourceMeta.sourceText) || "";
}

export function readUrlFromSourceMeta(value: LessonMaterialJson | unknown): string {
  const sourceMeta = asJsonObject(value);
  return asString(sourceMeta.sourceUrl) || asString(sourceMeta.url) || "";
}

export function flattenCourseLessonMaterialOptions(
  courses: Course[],
  lessons: CourseLessonMap,
): Array<{ key: string; label: string; courseId: string; lesson: CourseLesson }> {
  return courses.flatMap((course) =>
    (lessons[course.id] ?? []).map((lesson) => ({
      key: `${course.id}:${lesson.id}`,
      courseId: course.id,
      lesson,
      label: `${course.title} · ${lesson.orderIndex ?? "?"}. ${lesson.title}${lesson.materialTitle ? ` · ${lesson.materialTitle}` : ""}`,
    })),
  );
}

export function materialBlockIcon(type: MaterialBlockType): ReactNode {
  switch (type) {
    case "videoEmbed":
      return <Video className="h-4 w-4" />;
    case "image":
      return <ImageIcon className="h-4 w-4" />;
    case "generatedImage":
      return <Bot className="h-4 w-4" />;
    case "flashcards":
      return <Layers3 className="h-4 w-4" />;
    case "fillGaps":
    case "multipleChoice":
      return <FileText className="h-4 w-4" />;
    case "matchingPairs":
      return <Link2 className="h-4 w-4" />;
    case "freeWriting":
      return <PenLine className="h-4 w-4" />;
    case "speakingPrompt":
      return <Users className="h-4 w-4" />;
    case "drawingArea":
      return <MousePointer2 className="h-4 w-4" />;
    case "text":
    default:
      return <BookOpen className="h-4 w-4" />;
  }
}

export function materialBlockLabel(type: MaterialBlockType): string {
  switch (type) {
    case "text":
      return "Текст";
    case "image":
      return "Картинка";
    case "generatedImage":
      return "AI-картинка";
    case "videoEmbed":
      return "Видео";
    case "flashcards":
      return "Карточки";
    case "fillGaps":
      return "Пропуски";
    case "multipleChoice":
      return "Тест";
    case "matchingPairs":
      return "Соответствия";
    case "freeWriting":
      return "Письмо";
    case "speakingPrompt":
      return "Speaking";
    case "drawingArea":
      return "Поле";
    default:
      return "Блок";
  }
}

export function isObjectiveMaterialBlockType(type: MaterialBlockType): boolean {
  return type === "fillGaps" || type === "multipleChoice" || type === "matchingPairs";
}

export function parseFlashcards(value: string, previousCards: MaterialEditorBlock["cards"] = []): MaterialEditorBlock["cards"] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [front = "", back = "", example = ""] = splitMaterialLine(line, 3);
      return {
        id: previousCards?.[index]?.id ?? createClientId("card"),
        front: front.trim(),
        back: back.trim(),
        example: example.trim() || undefined,
      };
    })
    .filter((card) => card.front || card.back);
}

export function formatFlashcards(cards: MaterialEditorBlock["cards"]): string {
  return (cards ?? [])
    .map((card) => [card.front, card.back, card.example].filter(Boolean).map(escapeMaterialCell).join(" | "))
    .join("\n");
}

export function parseExerciseItems(value: string, type: "fillGaps" | "multipleChoice"): MaterialEditorBlock["items"] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [prompt = "", optionsOrAnswer = "", answer = "", weight = ""] = splitMaterialLine(line, 4);
      const parsedWeight = parseOptionalNumber(weight);
      if (type === "multipleChoice") {
        return {
          prompt: prompt.trim(),
          options: splitMaterialList(optionsOrAnswer).map((option) => option.trim()).filter(Boolean),
          answer: answer.trim() || undefined,
          weight: parsedWeight && parsedWeight > 0 ? parsedWeight : undefined,
        };
      }

      return {
        prompt: prompt.trim(),
        options: answer ? splitMaterialList(optionsOrAnswer).map((option) => option.trim()).filter(Boolean) : undefined,
        answer: (answer || optionsOrAnswer).trim() || undefined,
        weight: parsedWeight && parsedWeight > 0 ? parsedWeight : undefined,
      };
    })
    .filter((item) => item.prompt);
}

export function formatExerciseItems(items: MaterialEditorBlock["items"], type: "fillGaps" | "multipleChoice"): string {
  return (items ?? [])
    .map((item) => {
      if (type === "multipleChoice") {
        return [item.prompt, formatMaterialList(item.options), item.answer, item.weight].filter(Boolean).map(escapeMaterialCell).join(" | ");
      }

      return [item.prompt, formatMaterialList(item.options), item.answer, item.weight].filter(Boolean).map(escapeMaterialCell).join(" | ");
    })
    .join("\n");
}

export function splitMaterialLine(value: string, maxParts: number): string[] {
  const separator = findMaterialSeparator(value);
  const parts: string[] = [];
  let current = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    if (char === "\\" && (next === "|" || next === ";" || next === "\\")) {
      current += next;
      index += 1;
      continue;
    }
    if (char === separator && parts.length < maxParts - 1) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  parts.push(current);
  return parts;
}

export function splitMaterialList(value?: string): string[] {
  if (!value) {
    return [];
  }
  const parts: string[] = [];
  let current = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    if (char === "\\" && (next === "," || next === "\\")) {
      current += next;
      index += 1;
      continue;
    }
    if (char === ",") {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  parts.push(current);
  return parts;
}

export function formatMaterialList(value?: string[]): string | undefined {
  if (!value?.length) {
    return undefined;
  }
  return value.map(escapeMaterialListItem).join(", ");
}

export function findMaterialSeparator(value: string): "|" | ";" {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\\" && value[index + 1]) {
      index += 1;
      continue;
    }
    if (value[index] === "|") {
      return "|";
    }
  }

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\\" && value[index + 1]) {
      index += 1;
      continue;
    }
    if (value[index] === ";") {
      return ";";
    }
  }

  return "|";
}

export function escapeMaterialCell(value: unknown): string {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

export function escapeMaterialListItem(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,");
}

export function normalizeMaterialBlockType(value: string): MaterialBlockType | null {
  const allowed: MaterialBlockType[] = [
    "text",
    "image",
    "videoEmbed",
    "flashcards",
    "fillGaps",
    "multipleChoice",
    "matchingPairs",
    "freeWriting",
    "speakingPrompt",
    "drawingArea",
    "generatedImage",
  ];

  return allowed.includes(value as MaterialBlockType) ? value as MaterialBlockType : null;
}

export function asJsonObject(value: unknown): LessonMaterialJson {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as LessonMaterialJson;
  }

  return {};
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function asPositiveNumber(value: unknown): number | null {
  const parsed = asNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function createClientId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  return `${prefix}-${randomId}`;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 КБ";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.ceil(bytes / 1024)} КБ`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function materialSubmissionUserLabel(submission: LessonMaterialSubmission): string {
  return submission.userName?.trim() || submission.userSubject?.trim() || "Ученик";
}

export function averageSubmissionScore(submissions: LessonMaterialSubmission[]): number | null {
  const scores = submissions
    .map((submission) => submission.score)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));

  if (scores.length === 0) {
    return null;
  }

  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

export function materialSubmissionAssessmentSummary(submission: LessonMaterialSubmission): { hints: number; label: string; retries: number } {
  const assessment = asJsonObject(asJsonObject(submission.content).assessment);
  const items = Array.isArray(assessment.items) ? assessment.items.map(asJsonObject) : [];
  const hints = items.reduce((total, item) => total + (asNumber(item.hintsUsed) ?? 0), 0);
  const retries = items.reduce((total, item) => total + Math.max(0, (asNumber(item.attemptsUsed) ?? 0) - 1), 0);
  const errors = asNumber(assessment.errorsCount) ?? submission.errorsCount ?? 0;
  return {
    hints,
    retries,
    label: `${errors} ошибок, ${hints} подсказок, ${retries} дополнительных попыток`,
  };
}

export function formatMaterialScore(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "10";
  }

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }

  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

export function formatSubmissionTime(value: string | null | undefined): string {
  if (!value) {
    return "черновик";
  }

  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
