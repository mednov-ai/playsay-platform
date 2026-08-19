export type ClipboardCopyResult =
  | { copied: true; text: string }
  | { copied: false; text: string };

export async function copyTextFromPromise(text: Promise<string>): Promise<ClipboardCopyResult> {
  if (typeof ClipboardItem === "function" && typeof navigator.clipboard?.write === "function") {
    try {
      const blob = text.then((value) => new Blob([value], { type: "text/plain" }));
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      return { copied: true, text: await text };
    } catch {
      // Continue with the same in-flight text request. Some browsers expose the
      // async Clipboard API but reject it under their permission policy.
    }
  }

  const value = await text;
  try {
    await navigator.clipboard.writeText(value);
    return { copied: true, text: value };
  } catch {
    return { copied: false, text: value };
  }
}
