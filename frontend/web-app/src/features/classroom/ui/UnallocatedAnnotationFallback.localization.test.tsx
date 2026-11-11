// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { changeAppLanguage } from "../../../shared/i18n";
import { UnallocatedAnnotationFallback } from "./UnallocatedAnnotationFallback";

afterEach(cleanup);
describe("unallocated history without the original material", () => {
  it.each([
    ["ru", "Область рисунка", "Исходный материал недоступен."],
    ["en", "Annotation region", "The original material is unavailable."],
    ["de", "Anmerkungsbereich", "Das ursprüngliche Material ist nicht verfügbar."],
    ["fr", "Zone d’annotation", "Le document d’origine est indisponible."],
  ])("describes the separate regions in %s", async (language, label, message) => {
    await changeAppLanguage(language);
    const stroke = (id: string) => ({ id, kind: "stroke" as const, pageId: id, color: "#000", createdAt: 1, strokeWidth: 4 as const, points: [{ x: 1, y: 2, pageId: id }] });
    render(<UnallocatedAnnotationFallback content={{ schemaVersion: 7, coordinateSpace: "material-page", activePageId: "a", elements: [stroke("a"), stroke("b")] }} />);
    expect(screen.getByRole("combobox", { name: label })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(message);
  });
});
