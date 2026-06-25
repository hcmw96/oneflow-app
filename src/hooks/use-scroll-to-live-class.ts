import { useEffect, useRef, type RefObject } from "react";

/**
 * Scrolls the focus class card to the top of its scroll container (or viewport).
 * Re-scrolls when focus moves to the next class as time passes.
 */
export function useScrollToLiveClass(
  focusClassId: string | null,
  enabled: boolean,
  containerRef?: RefObject<HTMLElement | null>,
) {
  const prevFocusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !focusClassId) return;

    const isFirst = prevFocusRef.current === null;
    const focusChanged = prevFocusRef.current !== focusClassId;
    if (!isFirst && !focusChanged) return;

    prevFocusRef.current = focusClassId;

    const run = () => {
      const selector = `[data-live-class-id="${CSS.escape(focusClassId)}"]`;
      const root = containerRef?.current ?? document;
      const el = root.querySelector(selector);
      if (!(el instanceof HTMLElement)) return;
      el.scrollIntoView({ block: "start", behavior: isFirst ? "instant" : "smooth" });
    };

    requestAnimationFrame(run);
  }, [focusClassId, enabled, containerRef]);
}
