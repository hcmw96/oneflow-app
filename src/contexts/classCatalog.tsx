/**
 * Loads `class_categories` + `class_types` once at app boot and hydrates the synchronous
 * lookups in `@/lib/allowedClassTypes`.
 *
 * Hydration mutates module-level records, which React cannot observe, so this context
 * exists mainly to give components a re-render when the catalog arrives (and again after
 * Master edits a type). Components that only need a label can keep calling the synchronous
 * helpers; components that must repaint on a rename should read `useClassCatalog()`.
 *
 * Nothing blocks on this. Until it resolves — or if it fails, e.g. the migration has not
 * been pushed yet — the seeded enum literals stand in, which is exactly today's behaviour.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  EMPTY_CLASS_CATALOG,
  loadAndHydrateClassCatalog,
  type ClassCatalog,
} from "@/lib/classTypeCatalog";

type ClassCatalogContextValue = {
  catalog: ClassCatalog;
  /** False until the first load settles, successfully or not. */
  ready: boolean;
  /** Re-fetch and re-hydrate, so a rename in Master lands without a reload. */
  reload: () => Promise<void>;
};

const ClassCatalogContext = createContext<ClassCatalogContextValue>({
  catalog: EMPTY_CLASS_CATALOG,
  ready: false,
  reload: async () => {},
});

export function ClassCatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<ClassCatalog>(EMPTY_CLASS_CATALOG);
  const [ready, setReady] = useState(false);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    const next = await loadAndHydrateClassCatalog();
    if (!mounted.current) return;
    setCatalog(next);
    setReady(true);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
    };
  }, [reload]);

  const value = useMemo(() => ({ catalog, ready, reload }), [catalog, ready, reload]);

  return (
    <ClassCatalogContext.Provider value={value}>{children}</ClassCatalogContext.Provider>
  );
}

export function useClassCatalog(): ClassCatalogContextValue {
  return useContext(ClassCatalogContext);
}
