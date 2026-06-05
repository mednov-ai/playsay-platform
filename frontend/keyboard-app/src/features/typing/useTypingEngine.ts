import { useEffect } from "react";
import { LAYOUTS } from "../../entities/layouts";
import { useTypingStore } from "./typingStore";

export function useTypingEngine(enabled: boolean) {
  const handleKey = useTypingStore((state) => state.handleKey);
  const layoutId = useTypingStore((state) => state.layoutId);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
        return;
      }

      if (event.code === "Space" || LAYOUTS[layoutId].byCode[event.code]) {
        event.preventDefault();
        handleKey(event.code);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, handleKey, layoutId]);
}
