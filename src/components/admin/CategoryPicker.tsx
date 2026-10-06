/**
 * Shared category selector for Master → Class types.
 *
 * Options come from `public.class_categories` via the class catalog (not the
 * seeded `CLASS_CATEGORY_SLUGS` list). "+ New category" is inherit-only: the
 * new row copies the parent's `legacy_class_type` so credit rules stay on the
 * Postgres enum. The inherit form is inline so it works inside the type dialog
 * (a nested Radix Dialog does not).
 */
import { useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";
import { uniqueClassTaxonomySlug } from "@/lib/classTypeOptions";
import type { ClassCategoryRow } from "@/lib/classTypeCatalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  categories: readonly ClassCategoryRow[];
  value: string;
  onChange: (categoryId: string) => void;
  onCreated: (categoryId: string) => Promise<void> | void;
  canCreate: boolean;
  disabled?: boolean;
};

function findByNameCI(
  categories: readonly ClassCategoryRow[],
  name: string,
): ClassCategoryRow | undefined {
  const key = name.trim().toLowerCase();
  if (!key) return undefined;
  return categories.find((c) => c.name.trim().toLowerCase() === key);
}

export function CategoryPicker({
  categories,
  value,
  onChange,
  onCreated,
  canCreate,
  disabled,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [inheritFromId, setInheritFromId] = useState("");
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(
    () =>
      categories
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [categories],
  );

  const inheritParent = sorted.find((c) => c.id === inheritFromId) ?? null;

  const openCreate = () => {
    setInheritFromId(value || sorted[0]?.id || "");
    setNewName("");
    setCreating(true);
  };

  const saveCategory = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Category name is required");
      return;
    }
    const existing = findByNameCI(sorted, name);
    if (existing) {
      toast.success(`“${existing.name}” already exists — selected`);
      onChange(existing.id);
      setCreating(false);
      setNewName("");
      return;
    }
    const parent = sorted.find((c) => c.id === inheritFromId);
    if (!parent) {
      toast.error("Pick a category to inherit payment rules from");
      return;
    }
    const slug = uniqueClassTaxonomySlug(
      name,
      new Set(sorted.map((c) => c.slug)),
    );
    if (!slug) {
      toast.error("Could not derive a slug from that name — try a different one");
      return;
    }
    const sortOrder = Math.max(0, ...sorted.map((c) => c.sort_order)) + 10;

    setSaving(true);
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
      if (error) {
        const msg = error.message ?? "";
        if (/duplicate|unique/i.test(msg)) {
          toast.error("A category with that name or slug already exists");
          return;
        }
        throw error;
      }
      if (!data?.id) throw new Error("Category was created but no id came back");
      toast.success(`“${name}” added — billing matches ${parent.name}`);
      setCreating(false);
      setNewName("");
      await onCreated(data.id);
    } catch (e: unknown) {
      console.error("class category create failed", e);
      toast.error(supabaseErrorMessage(e, "Could not create category"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Label>Category</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Pick a category" />
        </SelectTrigger>
        <SelectContent>
          {sorted.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {canCreate && !creating ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1.5 h-7 px-2 text-xs"
          disabled={disabled}
          onClick={openCreate}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> New category
        </Button>
      ) : null}
      {canCreate && creating ? (
        <div className="mt-2 grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <div>
            <Label htmlFor="cat-picker-name">New category name</Label>
            <Input
              id="cat-picker-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Reformer"
              disabled={saving}
            />
          </div>
          <div>
            <Label>Inherit payment rules from</Label>
            <Select
              value={inheritFromId}
              onValueChange={setInheritFromId}
              disabled={saving}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent>
                {sorted.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {inheritParent ? (
            <p className="text-xs text-[#3d4f36]">
              Classes in this category will be covered by the same passes and credits as{" "}
              <span className="font-semibold">{inheritParent.name}</span>.
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => {
                setCreating(false);
                setNewName("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={() => void saveCategory()}
              className="bg-[#a3b693] text-white hover:bg-[#8fa67d]"
            >
              {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Create category
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
