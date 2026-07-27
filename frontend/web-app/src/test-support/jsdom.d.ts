declare module "jsdom" {
  type JSDOMWindow = Window & typeof globalThis;

  interface JSDOMOptions {
    beforeParse?: (window: JSDOMWindow) => void;
    pretendToBeVisual?: boolean;
    runScripts?: "dangerously" | "outside-only";
    url?: string;
  }

  export class JSDOM {
    constructor(html?: string, options?: JSDOMOptions);

    readonly window: JSDOMWindow;
  }
}
