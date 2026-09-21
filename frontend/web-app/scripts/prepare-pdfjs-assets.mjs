import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pdfjs = resolve(project, "../node_modules/pdfjs-dist");
const output = resolve(project, "public/pdfjs");
await mkdir(output, { recursive: true });
for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
  await cp(resolve(pdfjs, directory), resolve(output, directory), { recursive: true, force: true });
}
const vendor = resolve(project, "public/vendor");
await mkdir(vendor, { recursive: true });
await cp(
  resolve(project, "../node_modules/pptx-react-viewer/dist/pptx-viewer.css"),
  resolve(vendor, "pptx-viewer.css"),
  { force: true },
);
