import type { MaterialBlockType, MaterialDraftSourceImage, MaterialEditorBlock, MaterialEditorDocument, MaterialEditorPage, MaterialFormState, MaterialMatchingPair } from "./types";
import { asJsonObject, createClientId, materialBlockLabel } from "./formatters";
import { defaultObjectiveAssessmentPolicy } from "./scoring";

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
