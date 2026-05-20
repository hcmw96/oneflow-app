import * as React from "react";

/** True when viewport width is below `maxWidth` (exclusive upper bound). */
export function useMaxWidth(maxWidth: number) {
  const query = `(max-width: ${maxWidth - 1}px)`;
  const [matches, setMatches] = React.useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
