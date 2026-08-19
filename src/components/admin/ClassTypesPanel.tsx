/**
 * Master → Class types.
 *
 * Editing a type here cascades to every class of that type, because titles are derived at
 * render time from category + type and nothing copies the name into `public.classes`.
 * Renaming "Power" retitles all 30 scheduled Power classes with a single row update.
 *
 * Types are retired with `is_active`, never deleted: `guides.disciplines` stores these
 * slugs, so deleting one orphans guide records. There is no DELETE grant on the table.
 *
 * Categories are seeded (Yoga, Sculpt, Pilates, Wellzone, Events) and may be added
 * only by inheriting an existing category's `legacy_class_type`, so credit rules stay
 * on the Postgres enum. Standalone billing is deferred. Credit rules for Wellzone vs
 * everything else still key on that enum — a category with no inherited enum cannot
 * be created from this dialog.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";
import { useClassCatalog } from "@/contexts/classCatalog";
import { slugifyClassTypeName } from "@/lib/classTypeOptions";
import { classTypeTheme } from "@/lib/allowedClassTypes";
import type { ClassCategoryRow, ClassTypeRow } from "@/lib/classTypeCatalog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = { canManage: boolean };

type DraftType = {
  name: string;
  categoryId: string;
  sortOrder: string;
  isActive: boolean;
  isFreeIntro: boolean;
  isGuided: boolean;
};

const EMPTY_DRAFT: DraftType = {
  name: "",
  categoryId: "",
  sortOrder: "0",
  isActive: true,
  isFreeIntro: false,
  isGuided: true,
};

function draftFromRow(row: ClassTypeRow): DraftType {
  return {
    name: row.name,
    categoryId: row.category_id,
    sortOrder: String(row.sort_order),
    isActive: row.is_active,
    isFreeIntro: row.is_free_intro,
    isGuided: row.is_guided,
  };
}

/** Next free slug for a name, so two categories can both hold a type called "Flow". */
function uniqueSlug(name: string, taken: ReadonlySet<string>): string | null {
  const base = slugifyClassTypeName(name);
  if (!base) return null;
  if (!taken.has(base)) return base;
  for (let i = 2; i < 50; i++) {
    const candidate = `${base}_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return null;
}

export function ClassTypesPanel({ canManage }: Props) {
  const { catalog, ready, reload } = useClassCatalog();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftType>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  /** Type id whose is_active switch is mid-write. */
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [inheritFromId, setInheritFromId] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

  const categories = useMemo(
    () =>
      catalog.categories
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [catalog.categories],
  );

  const grouped = useMemo(
    () =>
      categories.map((category) => ({
        category,
        types: catalog.types
          .filter((t) => t.category_id === category.id)
          .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
      })),
    [categories, catalog.types],
  );

  const takenSlugs = useMemo(
    () => new Set(catalog.types.map((t) => t.slug)),
    [catalog.types],
  );

  const editingRow = useMemo(
    () => (editingId ? (catalog.types.find((t) => t.id === editingId) ?? null) : null),
    [editingId, catalog.types],
  );

  useEffect(() => {
    if (dialogOpen || categories.length === 0) return;
    setDraft((d) => (d.categoryId ? d : { ...d, categoryId: categories[0].id }));
  }, [dialogOpen, categories]);

  const openCreate = useCallback(() => {
    if (!canManage) return;
    setEditingId(null);
    setDraft({ ...EMPTY_DRAFT, categoryId: categories[0]?.id ?? "" });
    setDialogOpen(true);
  }, [canManage, categories]);

  const openEdit = useCallback(
    (row: ClassTypeRow) => {
      if (!canManage) return;
      setEditingId(row.id);
      setDraft(draftFromRow(row));
      setDialogOpen(true);
    },
    [canManage],
  );

  const save = async () => {
    if (!canManage) return;
    const name = draft.name.trim();
    if (!name) {
      toast.error("Type name is required");
      return;
    }
    if (!draft.categoryId) {
      toast.error("Pick a category");
      return;
    }
    const sortOrder = Number(draft.sortOrder);
    if (!Number.isFinite(sortOrder)) {
      toast.error("Order must be a number");
      return;
    }
    const category = catalog.categoryById.get(draft.categoryId);
    if (!category) {
      toast.error("That category no longer exists — reload and try again");
      return;
    }

    setSaving(true);
    try {
      if (editingRow) {
        const previousCategory = catalog.categoryById.get(editingRow.category_id);
        // Only re-inherit the enum value when it was inherited in the first place. Moving
        // "Power" between categories must not silently change which credits cover it —
        // its legacy_class_type is `power`, not its old category's billing enum.
        const parentLegacy = previousCategory?.legacy_class_type ?? previousCategory?.slug;
        const inherited =
          previousCategory != null && editingRow.legacy_class_type === parentLegacy;
        const legacy =
          inherited && draft.categoryId !== editingRow.category_id
            ? category.legacy_class_type
            : editingRow.legacy_class_type;

        const { error } = await supabase
          .from("class_types")
          .update({
            name,
            category_id: draft.categoryId,
            legacy_class_type: legacy,
            is_active: draft.isActive,
            is_free_intro: draft.isFreeIntro,
            is_guided: draft.isGuided,
            sort_order: Math.round(sortOrder),
          })
          .eq("id", editingRow.id);
        if (error) throw error;
        toast.success(`“${name}” updated — every class of this type follows`);
      } else {
        const slug = uniqueSlug(name, takenSlugs);
        if (!slug) {
          toast.error("Could not derive a slug from that name — try a different one");
          setSaving(false);
          return;
        }
        const { error } = await supabase.from("class_types").insert({
          category_id: draft.categoryId,
          slug,
          name,
          // Inherit the category's billing enum — never the category slug, which may not
          // be a public.class_type value once inherited categories exist.
          legacy_class_type: category.legacy_class_type,
          is_active: draft.isActive,
          is_free_intro: draft.isFreeIntro,
          is_guided: draft.isGuided,
          sort_order: Math.round(sortOrder),
        });
        if (error) throw error;
        toast.success(`“${category.name}: ${name}” created — schedule it from Week`);
      }

      setDialogOpen(false);
      setEditingId(null);
      await reload();
    } catch (e: unknown) {
      console.error("class type save failed", e);
      toast.error(supabaseErrorMessage(e, "Could not save class type"));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: ClassTypeRow, next: boolean) => {
    if (!canManage) return;
    setTogglingId(row.id);
    const { error } = await supabase
      .from("class_types")
      .update({ is_active: next })
      .eq("id", row.id);
    setTogglingId(null);
    if (error) {
      console.error("class type toggle failed", error);
      toast.error(supabaseErrorMessage(error, "Could not update class type"));
      return;
    }
    await reload();
  };

  const inheritParent = catalog.categoryById.get(inheritFromId) ?? null;

  const saveNewCategory = async () => {
    if (!canManage) return;
    const name = newCategoryName.trim();
    if (!name) {
      toast.error("Category name is required");
      return;
    }
    const parent = catalog.categoryById.get(inheritFromId);
    if (!parent) {
      toast.error("Pick a category to inherit payment rules from");
      return;
    }
    const taken = new Set(catalog.categories.map((c) => c.slug));
    const slug = uniqueSlug(name, taken);
    if (!slug) {
      toast.error("Could not derive a slug from that name — try a different one");
      return;
    }
    const sortOrder =
      Math.max(0, ...catalog.categories.map((c) => c.sort_order)) + 10;

    setSavingCategory(true);
    try {
      const { data, error } = await supabase
        .from("class_categories")
        .insert({
          slug,
          name,
          colour: parent.colour,
          sort_order: sortOrder,
          legacy_class_type: parent.legacy_class_type,
        })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data?.id) throw new Error("Category was created but no id came back");
      toast.success(`“${name}” added — billing matches ${parent.name}`);
      setNewCategoryOpen(false);
      setNewCategoryName("");
      await reload();
      setDraft((d) => ({ ...d, categoryId: data.id }));
    } catch (e: unknown) {
      console.error("class category create failed", e);
      toast.error(supabaseErrorMessage(e, "Could not create category"));
    } finally {
      setSavingCategory(false);
    }
  };

  if (!ready) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Class types are not set up yet.</p>
        <p className="mt-1">
          Push <code className="font-mono text-xs">20260817120000_class_categories_and_types.sql</code>{" "}
          to create the categories and types tables, then reload this page.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Renaming a type retitles every class of that type. Retire a type with its switch —
          types are never deleted, because guide records reference them.
        </p>
        {canManage ? (
          <Button
            type="button"
            size="sm"
            onClick={openCreate}
            className="gap-2 bg-[#a3b693] text-white hover:bg-[#8fa67d]"
          >
            <Plus className="h-4 w-4" /> New type
          </Button>
        ) : null}
      </div>

      <div className="space-y-4">
        {grouped.map(({ category, types }) => (
          <section key={category.id}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 border-b border-border pb-1">
              <h2 className="font-display text-xs font-bold uppercase tracking-wider text-[#3d4f36]">
                {category.name}
                <span className="ml-2 font-sans font-medium normal-case tracking-normal text-muted-foreground">
                  — {types.length} type{types.length === 1 ? "" : "s"}
                </span>
              </h2>
            </div>
            {types.length === 0 ? (
              <p className="px-1 py-1.5 text-xs text-muted-foreground">No types yet</p>
            ) : (
              <ul className="overflow-hidden rounded-xl border border-border bg-card">
                {types.map((t) => {
                  const theme = classTypeTheme(t.slug);
                  return (
                    <li key={t.id} className="border-b border-border last:border-b-0">
                      <div
                        role={canManage ? "button" : undefined}
                        tabIndex={canManage ? 0 : undefined}
                        onClick={() => openEdit(t)}
                        onKeyDown={(e) => {
                          if (!canManage) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openEdit(t);
                          }
                        }}
                        className={cn(
                          "flex items-center gap-3 border-l-4 px-3 py-2 transition",
                          theme.tint,
                          canManage && "cursor-pointer hover:bg-muted/40",
                          !t.is_active && "opacity-55",
                        )}
                        style={{
                          borderLeftColor: theme.accent,
                          backgroundColor: theme.tintBg || undefined,
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <p className="truncate font-display text-sm font-semibold text-foreground">
                              {category.name}: {t.name}
                            </p>
                            {t.is_free_intro ? (
                              <span className="shrink-0 rounded-full border border-[#c5d4b8] bg-primary-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#3d4f36]">
                                Free intro
                              </span>
                            ) : null}
                            {!t.is_guided ? (
                              <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                Unguided
                              </span>
                            ) : null}
                          </div>
                          <p className="truncate text-[11px] text-muted-foreground">
                            <span className="font-mono">{t.slug}</span> · order {t.sort_order}
                          </p>
                        </div>
                        <div
                          className="flex shrink-0 items-center gap-2"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          {togglingId === t.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          ) : null}
                          <Switch
                            checked={t.is_active}
                            onCheckedChange={(v) => void toggleActive(t, v)}
                            disabled={!canManage || togglingId === t.id}
                            aria-label={`${t.name} active`}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingId(null);
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRow ? "Edit class type" : "New class type"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label htmlFor="ct-name">Name</Label>
              <Input
                id="ct-name"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Flow State"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Classes show as{" "}
                <span className="font-medium text-foreground">
                  {(catalog.categoryById.get(draft.categoryId)?.name ?? "Category") +
                    ": " +
                    (draft.name.trim() || "Name")}
                </span>
                .
              </p>
            </div>
            <div>
              <Label>Category</Label>
              <Select
                value={draft.categoryId}
                onValueChange={(v) => setDraft((d) => ({ ...d, categoryId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c: ClassCategoryRow) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1.5 h-7 px-2 text-xs"
                  onClick={() => {
                    setInheritFromId(draft.categoryId || categories[0]?.id || "");
                    setNewCategoryName("");
                    setNewCategoryOpen(true);
                  }}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> New category
                </Button>
              ) : null}
            </div>
            <div>
              <Label htmlFor="ct-order">Order within category</Label>
              <Input
                id="ct-order"
                type="number"
                value={draft.sortOrder}
                onChange={(e) => setDraft((d) => ({ ...d, sortOrder: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
              <div className="min-w-0">
                <Label htmlFor="ct-active" className="cursor-pointer">
                  Active
                </Label>
                <p className="text-xs text-muted-foreground">
                  Off hides it from class creation. Existing classes keep their type.
                </p>
              </div>
              <Switch
                id="ct-active"
                checked={draft.isActive}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, isActive: v }))}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
              <div className="min-w-0">
                <Label htmlFor="ct-free" className="cursor-pointer">
                  Free intro
                </Label>
                <p className="text-xs text-muted-foreground">
                  Books with no credit and no payment.
                </p>
              </div>
              <Switch
                id="ct-free"
                checked={draft.isFreeIntro}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, isFreeIntro: v }))}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
              <div className="min-w-0">
                <Label htmlFor="ct-guided" className="cursor-pointer">
                  Has a guide
                </Label>
                <p className="text-xs text-muted-foreground">
                  Off for unguided sessions — class creation stops asking for a guide and
                  bulk reassignment skips them.
                </p>
              </div>
              <Switch
                id="ct-guided"
                checked={draft.isGuided}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, isGuided: v }))}
              />
            </div>
            {editingRow ? (
              <p className="text-xs text-muted-foreground">
                Slug <span className="font-mono">{editingRow.slug}</span> is fixed — guide
                records and existing bookings reference it.
              </p>
            ) : null}
          </div>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="bg-[#a3b693] text-white hover:bg-[#8fa67d]"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingRow ? "Save changes" : "Create type"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={newCategoryOpen}
        onOpenChange={(open) => {
          setNewCategoryOpen(open);
          if (!open) setNewCategoryName("");
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Reformer Classes"
              />
            </div>
            <div>
              <Label>Inherit payment rules from</Label>
              <Select value={inheritFromId} onValueChange={setInheritFromId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c: ClassCategoryRow) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {inheritParent ? (
              <p className="rounded-lg border border-[#c5d4b8]/80 bg-[#f4f7f0]/80 px-3 py-2.5 text-sm text-[#3d4f36]">
                Classes in this category will be covered by the same passes and credits as{" "}
                <span className="font-semibold">{inheritParent.name}</span>.
              </p>
            ) : null}
          </div>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setNewCategoryOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={savingCategory}
              onClick={() => void saveNewCategory()}
              className="bg-[#a3b693] text-white hover:bg-[#8fa67d]"
            >
              {savingCategory ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
