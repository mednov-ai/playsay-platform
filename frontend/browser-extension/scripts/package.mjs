import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { zipSync } from "fflate";

const root = new URL("../dist/", import.meta.url);
const files = {};

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else files[relative(root.pathname, path)] = new Uint8Array(await readFile(path));
  }
}

await collect(root.pathname);
files["INSTALL-RU.md"] = new Uint8Array(await readFile(new URL("../README.md", import.meta.url)));
await writeFile(new URL("../playsay-browser-extension.zip", import.meta.url), zipSync(files, { level: 9 }));
