import { useEffect, useRef } from "react";
import { useBlocker } from "@tanstack/react-router";

const MESSAGE = "You have unsaved changes. Are you sure you want to leave?";

/**
 * Blocks in-app navigation and tab close/refresh when `dirty` is true.
 */
export function useUnsavedLeave(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = MESSAGE;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const blocker = useBlocker({
    shouldBlockFn: () => dirtyRef.current,
    enableBeforeUnload: false,
    withResolver: true,
  });

  const handledRef = useRef(false);

  useEffect(() => {
    if (blocker.status !== "blocked") {
      handledRef.current = false;
      return;
    }
    if (handledRef.current) return;
    handledRef.current = true;
    const ok = window.confirm(MESSAGE);
    if (ok) {
      blocker.proceed?.();
    } else {
      blocker.reset?.();
    }
  }, [blocker]);
}
