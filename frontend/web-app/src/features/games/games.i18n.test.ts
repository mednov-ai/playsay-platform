import { expect, it } from "vitest";
import { resources } from "../../shared/i18n/resources";
function leaves(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") { expect(value.trim()).not.toBe(""); return [prefix]; }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => leaves(child, `${prefix}.${key}`)).sort();
}
it("has the same nonempty library, picker, processing and lesson labels in all four languages", () => {
  const keys = leaves(resources.en.translation.games);
  for (const locale of ["ru", "de", "fr"] as const) expect(leaves(resources[locale].translation.games)).toEqual(keys);
});
