import { type ReactNode, useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/** Fade/slide enter on route change + scroll to top (respects reduced motion). */
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      window.scrollTo(0, 0);
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [pathname, reducedMotion]);

  return (
    <div
      key={pathname}
      className={cn(
        "page-transition-enter flex min-h-0 min-w-0 flex-1 flex-col",
        reducedMotion && "page-transition-enter--reduced",
        className,
      )}
    >
      {children}
    </div>
  );
}
