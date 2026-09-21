// Browser builds use HTMLCanvasElement or OffscreenCanvas. This module only
// satisfies optional Node-only imports retained by PDF.js and emf-converter.
export class Canvas {}
export function createCanvas(): never {
  throw new Error("Node canvas is unavailable in the browser");
}
