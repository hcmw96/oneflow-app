import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/admin/products")({
  head: () => ({
    meta: [{ title: "Products — One Flow Admin" }],
  }),
  component: ProductsPage,
});

const SAGE = "#a3b693";
const SAGE_BORDER = "border-[#c5d4b8]/80";

const UNLIMITED_CREDITS = 999;

/** Matches DB `credit_category` / products.category enum (lowercase, underscores). */
const CREDIT_CATEGORIES = [
  "all_access",
  "cafe",
  "complimentary",
  "power",
  "staff",
  "wellzone",
  "yoga",
] as const;

type CreditCategory = (typeof CREDIT_CATEGORIES)[number];

function isCreditCategory(value: string): value is CreditCategory {
  return (CREDIT_CATEGORIES as readonly string[]).includes(value);
}

type ProductRow = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  price_zar: number;
  credit_count: number | null;
  validity_days: number | null;
  allowed_class_types: string[] | null;
  is_addon: boolean;
  is_staff_only: boolean;
  is_active: boolean;
  sort_order: number | null;
};

const CATEGORY_OPTIONS: { value: CreditCategory; label: string }[] = [
  { value: "all_access", label: "All Access" },
  { value: "cafe", label: "Café" },
  { value: "complimentary", label: "Complimentary" },
  { value: "power", label: "Power" },
  { value: "staff", label: "Staff" },
  { value: "wellzone", label: "Wellzone" },
  { value: "yoga", label: "Yoga" },
];

const CATEGORY_TABLE_LABEL: Record<string, string> = {
  all_access: "All Access",
  cafe: "Café",
  complimentary: "Complimentary",
  power: "Power",
  staff: "Staff",
  wellzone: "Wellzone",
  yoga: "Yoga",
};

const CLASS_TYPE_OPTIONS = [
  { value: "yoga", label: "Yoga" },
  { value: "sculpt", label: "Sculpt" },
  { value: "wellzone", label: "Wellzone" },
  { value: "sauna_journey", label: "Sauna journey" },
] as const;

function formatPriceZar(zar: number) {
  const n = Number(zar);
  if (Number.isNaN(n)) return "R—";
  return `R${n.toLocaleString("en-ZA", { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
}

function tableCategoryLabel(category: string | null | undefined) {
  if (!category) return "—";
  return CATEGORY_TABLE_LABEL[category] ?? category;
}

/** Parse PostgreSQL `text[]` text representation, e.g. `{yoga,sculpt}` or `{"yoga","sculpt"}`. */
function parsePostgresTextArrayString(s: string): string[] {
  const t = s.trim();
  if (t === "" || t === "{}") return [];
  if (!t.startsWith("{") || !t.endsWith("}")) return [];
  const inner = t.slice(1, -1);
  if (!inner) return [];
  return inner
    .split(",")
    .map((part) => {
      const p = part.trim();
      if (p.startsWith('"') && p.endsWith('"')) return p.slice(1, -1).replace(/""/g, '"');
      return p;
    })
    .filter(Boolean);
}

function normalizeClassTypes(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean);
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [];
    try {
      const parsed: unknown = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
    } catch {
      /* not JSON */
    }
    if (t.startsWith("{") && t.endsWith("}")) return parsePostgresTextArrayString(t);
  }
  return [];
}

/** Postgres `text[]`: pass a real JS string[] to PostgREST (never a single JSON string). */
function toPgTextArray(values: string[]): string[] {
  return [...values].map((v) => String(v).trim()).filter(Boolean);
}

function creditsDisplay(count: number | null) {
  if (count == null) return "—";
  const n = typeof count === "number" ? count : Number(count);
  if (!Number.isFinite(n)) return "—";
  if (n >= UNLIMITED_CREDITS) return "Unlimited";
  return String(Math.trunc(n));
}

function validityDisplay(days: number | null) {
  if (days == null || !Number.isFinite(Number(days))) return "—";
  const d = Math.trunc(Number(days));
  return `${d} day${d === 1 ? "" : "s"}`;
}

function emptyForm() {
  return {
    name: "",
    category: "yoga" as CreditCategory,
    description: "",
    priceZar: "",
    credits: "10",
    creditsUnlimited: false,
    validityDays: "30",
    allowedClassTypes: [] as string[],
    isAddon: false,
    isActive: true,
  };
}

type ProductSortKey = "name_asc" | "price_asc" | "price_desc" | "category";

function ProductsPage() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<ProductSortKey>("name_asc");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<CreditCategory>("yoga");
  const [description, setDescription] = useState("");
  const [priceZar, setPriceZar] = useState("");
  const [credits, setCredits] = useState("10");
  const [creditsUnlimited, setCreditsUnlimited] = useState(false);
  const [validityDays, setValidityDays] = useState("30");
  const [allowedClassTypes, setAllowedClassTypes] = useState<string[]>([]);
  const [isAddon, setIsAddon] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, name, category, description, price_zar, credit_count, validity_days, allowed_class_types, is_addon, is_staff_only, is_active, sort_order",
      );

    if (error) {
      console.error("products load failed", error);
      toast.error(supabaseErrorMessage(error, "Could not load products"));
      setRows([]);
      setLoading(false);
      return;
    }

    const mapped: ProductRow[] = (data ?? []).map((raw: Record<string, unknown>) => ({
      id: String(raw.id),
      name: String(raw.name ?? ""),
      category: String(raw.category ?? ""),
      description: raw.description == null ? null : String(raw.description),
      price_zar: Number(raw.price_zar ?? 0),
      credit_count: raw.credit_count == null ? null : Number(raw.credit_count),
      validity_days: raw.validity_days == null ? null : Number(raw.validity_days),
      allowed_class_types: normalizeClassTypes(raw.allowed_class_types),
      is_addon: Boolean(raw.is_addon),
      is_staff_only: Boolean(raw.is_staff_only),
      is_active: raw.is_active !== false,
      sort_order: raw.sort_order == null ? null : Number(raw.sort_order),
    }));

    setRows(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedRows = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      switch (sort) {
        case "price_asc":
          return a.price_zar - b.price_zar || a.name.localeCompare(b.name);
        case "price_desc":
          return b.price_zar - a.price_zar || a.name.localeCompare(b.name);
        case "category": {
          const ca = a.category.localeCompare(b.category);
          if (ca !== 0) return ca;
          return a.name.localeCompare(b.name);
        }
        case "name_asc":
        default:
          return a.name.localeCompare(b.name);
      }
    });
    return list;
  }, [rows, sort]);

  const resetFormToDefaults = useCallback(() => {
    const d = emptyForm();
    setName(d.name);
    setCategory(d.category);
    setDescription(d.description);
    setPriceZar(d.priceZar);
    setCredits(d.credits);
    setCreditsUnlimited(d.creditsUnlimited);
    setValidityDays(d.validityDays);
    setAllowedClassTypes(d.allowedClassTypes);
    setIsAddon(d.isAddon);
    setIsActive(d.isActive);
  }, []);

  const populateFromRow = useCallback((p: ProductRow) => {
    setName(p.name);
    setCategory(isCreditCategory(p.category) ? p.category : "yoga");
    setDescription(p.description ?? "");
    setPriceZar(String(p.price_zar ?? ""));
    const unlimited = (p.credit_count ?? 0) >= UNLIMITED_CREDITS;
    setCreditsUnlimited(unlimited);
    setCredits(unlimited ? "10" : String(p.credit_count ?? ""));
    setValidityDays(String(p.validity_days ?? ""));
    setAllowedClassTypes([...normalizeClassTypes(p.allowed_class_types)]);
    setIsAddon(p.is_addon);
    setIsActive(p.is_active);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setEditingId(null);
  }, []);

  const openAdd = () => {
    setEditingId(null);
    resetFormToDefaults();
    setSheetOpen(true);
  };

  const openEdit = (p: ProductRow) => {
    setEditingId(p.id);
    populateFromRow(p);
    setSheetOpen(true);
  };

  const toggleClassType = (value: string, checked: boolean) => {
    setAllowedClassTypes((prev) => {
      if (checked) return prev.includes(value) ? prev : [...prev, value];
      return prev.filter((x) => x !== value);
    });
  };

  const persistActive = async (id: string, next: boolean) => {
    setTogglingId(id);
    const { error } = await supabase.from("products").update({ is_active: next }).eq("id", id);
    setTogglingId(null);
    if (error) {
      console.error("products persistActive failed", error);
      toast.error(supabaseErrorMessage(error, "Could not update product"));
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: next } : r)));
    toast.success(next ? "Product activated" : "Product hidden from pricing");
  };

  const saveProduct = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name is required");
      return;
    }
    const price = Number(priceZar);
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Enter a valid price in ZAR");
      return;
    }
    const vd = Math.max(0, Math.floor(Number(validityDays)));
    if (!Number.isFinite(vd)) {
      toast.error("Enter valid validity days");
      return;
    }
    let creditCount: number;
    if (creditsUnlimited) {
      creditCount = UNLIMITED_CREDITS;
    } else {
      const c = Math.max(0, Math.floor(Number(credits)));
      if (!Number.isFinite(c)) {
        toast.error("Enter a valid credit count");
        return;
      }
      creditCount = c;
    }

    const existingRow = editingId ? rows.find((r) => r.id === editingId) : null;
    // Postgres `text[]`: native string[] for PostgREST (not JSON.stringify). Empty = unrestricted.
    const allowedPayload: string[] = toPgTextArray(
      allowedClassTypes.length > 0 ? allowedClassTypes : [],
    );

    const commonPayload = {
      name: trimmed,
      category,
      description: description.trim() ? description.trim() : null,
      price_zar: price,
      credit_count: creditCount,
      validity_days: vd,
      allowed_class_types: allowedPayload,
      is_addon: isAddon,
      is_active: isActive,
    };

    setSaving(true);
    if (editingId) {
      const { error } = await supabase
        .from("products")
        .update({
          ...commonPayload,
          is_staff_only: existingRow?.is_staff_only ?? false,
        })
        .eq("id", editingId);
      if (error) {
        console.error("products update failed", error);
        toast.error(`Save failed: ${supabaseErrorMessage(error, "Save failed — please try again")}`);
        setSaving(false);
        return;
      }
      toast.success("Product updated");
    } else {
      const { error } = await supabase.from("products").insert({
        ...commonPayload,
        is_staff_only: false,
        sort_order: 0,
      });
      if (error) {
        console.error("products insert failed", error);
        toast.error(`Save failed: ${supabaseErrorMessage(error, "Save failed — please try again")}`);
        setSaving(false);
        return;
      }
      toast.success("Product created");
    }
    closeSheet();
    await load();
    setSaving(false);
  };

  return (
    <div className="min-w-0">
      <PageHeader
        title="Products"
        description={loading ? "Loading…" : `${rows.length} products`}
        actions={
          <Button
            type="button"
            onClick={openAdd}
            className={cn("shrink-0 gap-2 bg-[#a3b693] text-white hover:bg-[#8fa67d]", SAGE_BORDER)}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            Add product
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={sort} onValueChange={(v) => setSort(v as ProductSortKey)}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name_asc">Name A–Z</SelectItem>
            <SelectItem value="price_asc">Price low–high</SelectItem>
            <SelectItem value="price_desc">Price high–low</SelectItem>
            <SelectItem value="category">Category</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div
        className={cn(
          "min-w-0 overflow-x-auto rounded-2xl border bg-card shadow-sm",
          SAGE_BORDER,
        )}
      >
        {loading ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: SAGE }} aria-label="Loading" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#e8efe3]/60">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium sm:px-5">Name</th>
                <th className="px-4 py-3 font-medium sm:px-5">Category</th>
                <th className="px-4 py-3 font-medium sm:px-5">Price</th>
                <th className="px-4 py-3 font-medium sm:px-5">Credits</th>
                <th className="px-4 py-3 font-medium sm:px-5">Validity</th>
                <th className="px-4 py-3 font-medium sm:px-5">Active</th>
                <th className="px-4 py-3 font-medium sm:px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="max-w-[140px] truncate px-4 py-3 font-semibold sm:max-w-xs sm:px-5 md:max-w-md">
                    {p.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 sm:px-5">
                    <span className="inline-flex rounded-full bg-[#e8efe3] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#3d4f36]">
                      {tableCategoryLabel(p.category)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums sm:px-5">
                    {formatPriceZar(p.price_zar)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 sm:px-5">{creditsDisplay(p.credit_count)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground sm:px-5">
                    {validityDisplay(p.validity_days)}
                  </td>
                  <td className="px-4 py-3 sm:px-5">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={p.is_active}
                        disabled={togglingId === p.id}
                        onCheckedChange={(checked) => void persistActive(p.id, checked)}
                        className="data-[state=checked]:bg-[#a3b693]"
                        aria-label={p.is_active ? "Deactivate product" : "Activate product"}
                      />
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {p.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right sm:px-5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1 border-[#c5d4b8] bg-card"
                      onClick={() => openEdit(p)}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && sortedRows.length === 0 && (
        <p className="mt-4 text-center text-sm text-muted-foreground">No products yet. Add one to get started.</p>
      )}

      <Sheet open={sheetOpen} onOpenChange={(o) => !o && closeSheet()}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-y-auto rounded-t-3xl border-t border-[#c5d4b8]/80"
        >
          <SheetHeader>
            <SheetTitle className="font-display text-xl">{editingId ? "Edit product" : "Add product"}</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4 px-1 pb-4">
            <div>
              <Label htmlFor="prod-name">Name</Label>
              <input
                id="prod-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#a3b693]"
                placeholder="e.g. 10 Class Pack"
              />
            </div>

            <div>
              <Label>Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(isCreditCategory(v) ? v : "yoga")}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="prod-desc">Description</Label>
              <Textarea
                id="prod-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1.5 min-h-[88px] focus-visible:ring-[#a3b693]"
                placeholder="Shown on the pricing page"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="prod-price">Price (ZAR)</Label>
                <input
                  id="prod-price"
                  type="number"
                  min={0}
                  step={1}
                  value={priceZar}
                  onChange={(e) => setPriceZar(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#a3b693]"
                />
              </div>
              <div>
                <Label htmlFor="prod-valid">Validity (days)</Label>
                <input
                  id="prod-valid"
                  type="number"
                  min={0}
                  step={1}
                  value={validityDays}
                  onChange={(e) => setValidityDays(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#a3b693]"
                />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="prod-unlimited" className="text-foreground">
                  Unlimited credits
                </Label>
                <Switch
                  id="prod-unlimited"
                  checked={creditsUnlimited}
                  onCheckedChange={setCreditsUnlimited}
                  className="data-[state=checked]:bg-[#a3b693]"
                />
              </div>
              {!creditsUnlimited && (
                <div className="mt-3">
                  <Label htmlFor="prod-credits">Credits</Label>
                  <input
                    id="prod-credits"
                    type="number"
                    min={0}
                    step={1}
                    value={credits}
                    onChange={(e) => setCredits(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#a3b693]"
                  />
                </div>
              )}
            </div>

            <div>
              <Label>Allowed class types</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">Optional — restrict which class types this product covers.</p>
              <ul className="mt-2 space-y-2 rounded-lg border border-border bg-background p-3">
                {CLASS_TYPE_OPTIONS.map((opt) => (
                  <li key={opt.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`ct-${opt.value}`}
                      checked={allowedClassTypes.includes(opt.value)}
                      onCheckedChange={(c) => toggleClassType(opt.value, c === true)}
                    />
                    <label htmlFor={`ct-${opt.value}`} className="text-sm leading-none">
                      {opt.label}
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/15 px-3 py-2">
              <div>
                <Label htmlFor="prod-addon" className="text-foreground">
                  Add-on (e.g. mat hire)
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">Hidden from main pricing grid when off-sale flow uses it.</p>
              </div>
              <Switch
                id="prod-addon"
                checked={isAddon}
                onCheckedChange={setIsAddon}
                className="data-[state=checked]:bg-[#a3b693]"
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/15 px-3 py-2">
              <Label htmlFor="prod-active" className="text-foreground">
                Active on pricing page
              </Label>
              <Switch
                id="prod-active"
                checked={isActive}
                onCheckedChange={setIsActive}
                className="data-[state=checked]:bg-[#a3b693]"
              />
            </div>
          </div>

          <SheetFooter className="flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={closeSheet} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void saveProduct()}
              className="bg-[#a3b693] text-white hover:bg-[#8fa67d]"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? "Save changes" : "Create product"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
