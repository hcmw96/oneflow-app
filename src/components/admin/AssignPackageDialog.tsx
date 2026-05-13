import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";
import {
  CREDIT_CATEGORY_ORDERED,
  PRODUCT_CATEGORY_SLUG_LABEL,
  normalizeProductCategoryKey,
  type CreditCategoryOrdered,
} from "@/lib/productCategories";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export type AssignPackageTarget = {
  profileId: string;
  displayName: string;
  email: string | null;
  firstName?: string | null;
};

type PackageAssignFailure = {
  displayName: string;
  profileId: string;
  email: string | null;
  reason: string;
};

function recordPackageAssignFailure(
  target: AssignPackageTarget,
  context: string,
  error: unknown,
  failures: PackageAssignFailure[],
): void {
  const reason = supabaseErrorMessage(error, "Unknown error");
  console.error(`[AssignPackageDialog] ${context}`, {
    profileId: target.profileId,
    displayName: target.displayName,
    email: target.email,
    reason,
    error,
  });
  failures.push({
    displayName: target.displayName,
    profileId: target.profileId,
    email: target.email,
    reason,
  });
}

function summarizePackageFailures(failures: PackageAssignFailure[]): string {
  if (failures.length === 0) return "";
  if (failures.length === 1) {
    const f = failures[0]!;
    return `${f.displayName} (${f.profileId}): ${f.reason}`;
  }
  return failures.map((f) => `• ${f.displayName} (${f.profileId}): ${f.reason}`).join("\n").slice(0, 2500);
}

type ProductPick = {
  id: string;
  name: string;
  category: string | null;
  credit_count: number | null;
  validity_days: number | null;
  allowed_class_types: string[] | null;
};

const CUSTOM_CATEGORY_ITEMS: { value: CreditCategoryOrdered; label: string }[] =
  CREDIT_CATEGORY_ORDERED.map((value) => ({
    value,
    label: PRODUCT_CATEGORY_SLUG_LABEL[value],
  }));

const CLASS_TYPE_OPTIONS = [
  { value: "yoga", label: "Yoga" },
  { value: "sculpt", label: "Sculpt" },
  { value: "pilates", label: "Pilates" },
  { value: "wellzone", label: "Wellzone" },
  { value: "sauna_journey", label: "Sauna journey" },
] as const;

const UNLIMITED_PRODUCT_THRESHOLD = 999;
const UNLIMITED_MANUAL_TOTAL = 999_999;

function normalizeClassTypes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x)).filter(Boolean);
}

function productCreditsLine(count: number, unlimited: boolean): string {
  if (unlimited) return "Unlimited credits are now available and ready to use.";
  return `${count} credits are now available and ready to use.`;
}

export type AssignedCreditRow = {
  id: string;
  product_name: string | null;
  credits_remaining: number | null;
  credits_total: number | null;
  is_unlimited: boolean | null;
  expires_at: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: AssignPackageTarget | null;
  /** When set, assigns the same package to every target (target is ignored). */
  bulkTargets?: AssignPackageTarget[] | null;
  canAssign: boolean;
  onAssigned?: () => void;
  /** Called after each successful insert (for live profile sheet credits). */
  onCreditInserted?: (row: AssignedCreditRow, profileId: string) => void;
};

export function AssignPackageDialog({
  open,
  onOpenChange,
  target,
  bulkTargets,
  canAssign,
  onAssigned,
  onCreditInserted,
}: Props) {
  const [tab, setTab] = useState<"existing" | "custom">("existing");
  const [products, setProducts] = useState<ProductPick[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [existingCategory, setExistingCategory] = useState<string>("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [existingNote, setExistingNote] = useState("");

  const [customName, setCustomName] = useState("");
  const [customCategory, setCustomCategory] = useState<CreditCategoryOrdered>("yoga");
  const [customCredits, setCustomCredits] = useState("10");
  const [customUnlimited, setCustomUnlimited] = useState(false);
  const [customValidityDays, setCustomValidityDays] = useState("");
  const [customClassTypes, setCustomClassTypes] = useState<string[]>([]);
  const [customNote, setCustomNote] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTab, setConfirmTab] = useState<"existing" | "custom">("existing");
  const prevOpenRef = useRef(false);

  const assignees = useMemo(() => {
    if (bulkTargets && bulkTargets.length > 0) return bulkTargets;
    if (target) return [target];
    return [];
  }, [bulkTargets, target]);

  const assigneeKey = useMemo(
    () => assignees.map((a) => a.profileId).slice().sort().join("|"),
    [assignees],
  );

  const resetForms = useCallback(() => {
    setTab("existing");
    setExistingCategory("");
    setSelectedProductId("");
    setExistingNote("");
    setCustomName("");
    setCustomCategory("yoga");
    setCustomCredits("10");
    setCustomUnlimited(false);
    setCustomValidityDays("");
    setCustomClassTypes([]);
    setCustomNote("");
    setConfirmOpen(false);
  }, []);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (open && !wasOpen) {
      resetForms();
    }
    if (!open && wasOpen) {
      resetForms();
    }
  }, [open, resetForms]);

  useEffect(() => {
    if (!open || assignees.length === 0) return;

    void (async () => {
      setProducts([]);
      setProductsLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("id, name, credit_count, category, validity_days, allowed_class_types")
        .eq("is_active", true)
        .eq("is_addon", false)
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        console.error(error);
        toast.error(supabaseErrorMessage(error, "Could not load products"));
        setProducts([]);
      } else {
        const rows = (data ?? []) as Record<string, unknown>[];
        setProducts(
          rows.map((raw) => ({
            id: String(raw.id),
            name: String(raw.name ?? ""),
            category: raw.category == null ? null : String(raw.category),
            credit_count: raw.credit_count == null ? null : Number(raw.credit_count),
            validity_days: raw.validity_days == null ? null : Number(raw.validity_days),
            allowed_class_types: normalizeClassTypes(raw.allowed_class_types),
          })),
        );
      }
      setProductsLoading(false);
    })();
  }, [open, assigneeKey]);

  const categorySlugsInCatalog = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) {
      s.add(normalizeProductCategoryKey(p.category));
    }
    return s;
  }, [products]);

  const existingCategoryOptions = useMemo(() => {
    const ordered: string[] = [...CREDIT_CATEGORY_ORDERED].filter((k) =>
      categorySlugsInCatalog.has(k),
    );
    if (categorySlugsInCatalog.has("other")) {
      ordered.push("other");
    }
    return ordered;
  }, [categorySlugsInCatalog]);

  const productsInSelectedCategory = useMemo(() => {
    if (!existingCategory) return [];
    return products
      .filter((p) => normalizeProductCategoryKey(p.category) === existingCategory)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [products, existingCategory]);

  const toggleClassType = (value: string) => {
    setCustomClassTypes((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
    );
  };

  const sendPackageEmail = async (
    to: string | null | undefined,
    firstName: string,
    packageName: string,
    creditsDescription: string,
    note: string,
  ) => {
    const em = (to ?? "").trim();
    if (!em) {
      toast.message("Package assigned — no email on file to notify.");
      return;
    }
    const { error } = await supabase.functions.invoke("send-email", {
      body: {
        to: em,
        template: "package_assigned",
        data: {
          first_name: firstName,
          package_name: packageName,
          credits_description: creditsDescription,
          note: note.trim() || undefined,
        },
      },
    });
    if (error) {
      console.error(error);
      toast.error(
        supabaseErrorMessage(error, "Package saved but email could not be sent — please try again"),
      );
    }
  };

  const assignExisting = async () => {
    if (!canAssign || assignees.length === 0) return;
    const product = products.find((p) => p.id === selectedProductId);
    if (!product) {
      toast.error("Select a product.");
      return;
    }
    const rawCount =
      typeof product.credit_count === "number"
        ? product.credit_count
        : Number(product.credit_count ?? 0);
    if (!Number.isFinite(rawCount) || rawCount < 0) {
      toast.error("This product has no valid credit count.");
      return;
    }
    const isUnlimited = rawCount >= UNLIMITED_PRODUCT_THRESHOLD;
    const total = isUnlimited ? rawCount : Math.trunc(rawCount);

    setSubmitting(true);
    const failures: PackageAssignFailure[] = [];
    for (const t of assignees) {
      const { data: inserted, error } = await supabase
        .from("user_credits")
        .insert({
          profile_id: t.profileId,
          product_id: product.id,
          product_name: product.name,
          category: product.category ?? "yoga",
          allowed_class_types: product.allowed_class_types?.length
            ? product.allowed_class_types
            : [],
          credits_total: total,
          credits_remaining: total,
          is_unlimited: isUnlimited,
          expires_at: product.validity_days
            ? new Date(Date.now() + Math.trunc(product.validity_days) * 86400000).toISOString()
            : null,
          yoco_payment_id: "manual_assignment",
        })
        .select("id, product_name, credits_remaining, credits_total, is_unlimited, expires_at")
        .maybeSingle();

      if (error) {
        recordPackageAssignFailure(t, "user_credits insert (existing product)", error, failures);
        continue;
      }
      if (inserted) {
        const row = inserted as AssignedCreditRow;
        onCreditInserted?.(row, t.profileId);
      }

      const first =
        (t.firstName?.trim() || t.displayName.split(/\s+/)[0] || "there") as string;
      await sendPackageEmail(
        t.email,
        first,
        product.name,
        productCreditsLine(total, isUnlimited),
        existingNote,
      );
    }
    setSubmitting(false);
    setConfirmOpen(false);

    if (failures.length > 0) {
      toast.error(
        failures.length === assignees.length
          ? "Could not assign package to any selected member."
          : `Could not assign to ${failures.length} member(s). Others were saved.`,
        { description: summarizePackageFailures(failures), duration: 16_000 },
      );
    } else {
      const names = assignees.map((a) => a.displayName).join(", ");
      toast.success(
        assignees.length === 1
          ? `${product.name} assigned to ${assignees[0]!.displayName}`
          : `${product.name} assigned to ${assignees.length} members`,
        { description: assignees.length === 1 ? undefined : names.slice(0, 120) },
      );
    }
    onOpenChange(false);
    onAssigned?.();
  };

  const assignCustom = async () => {
    if (!canAssign || assignees.length === 0) return;
    const name = customName.trim();
    if (!name) {
      toast.error("Package name is required.");
      return;
    }
    if (!customUnlimited) {
      const n = Math.trunc(Number(customCredits));
      if (!Number.isFinite(n) || n < 1) {
        toast.error("Enter a valid number of credits (at least 1).");
        return;
      }
    }
    let expiresAt: string | null = null;
    const vd = customValidityDays.trim();
    if (vd) {
      const days = Math.trunc(Number(vd));
      if (!Number.isFinite(days) || days < 1) {
        toast.error("Validity days must be a positive number or blank.");
        return;
      }
      expiresAt = new Date(Date.now() + days * 86400000).toISOString();
    }

    const isUnlimited = customUnlimited;
    const total = isUnlimited ? UNLIMITED_MANUAL_TOTAL : Math.trunc(Number(customCredits));

    setSubmitting(true);
    const failures: PackageAssignFailure[] = [];
    for (const t of assignees) {
      const { data: inserted, error } = await supabase
        .from("user_credits")
        .insert({
          profile_id: t.profileId,
          product_id: null,
          product_name: name,
          category: customCategory,
          allowed_class_types: customClassTypes,
          credits_total: total,
          credits_remaining: total,
          is_unlimited: isUnlimited,
          expires_at: expiresAt,
          yoco_payment_id: "manual_assignment",
        })
        .select("id, product_name, credits_remaining, credits_total, is_unlimited, expires_at")
        .maybeSingle();

      if (error) {
        recordPackageAssignFailure(t, "user_credits insert (custom package)", error, failures);
        continue;
      }
      if (inserted) {
        onCreditInserted?.(inserted as AssignedCreditRow, t.profileId);
      }

      const first = (t.firstName?.trim() || t.displayName.split(/\s+/)[0] || "there") as string;
      await sendPackageEmail(
        t.email,
        first,
        name,
        isUnlimited
          ? "Unlimited credits are now available and ready to use."
          : productCreditsLine(total, false),
        customNote,
      );
    }
    setSubmitting(false);
    setConfirmOpen(false);

    if (failures.length > 0) {
      toast.error(
        failures.length === assignees.length
          ? "Could not assign package to any selected member."
          : `Could not assign to ${failures.length} member(s). Others were saved.`,
        { description: summarizePackageFailures(failures), duration: 16_000 },
      );
    } else {
      toast.success(
        assignees.length === 1
          ? `${name} assigned to ${assignees[0]!.displayName}`
          : `${name} assigned to ${assignees.length} members`,
      );
    }
    onOpenChange(false);
    onAssigned?.();
  };

  const primaryAssignee = assignees[0];

  const existingConfirmCopy = useMemo(() => {
    const product = products.find((p) => p.id === selectedProductId);
    if (!product || !primaryAssignee) return "";
    const raw =
      typeof product.credit_count === "number"
        ? product.credit_count
        : Number(product.credit_count ?? 0);
    const unlimited = raw >= UNLIMITED_PRODUCT_THRESHOLD;
    const creditsPart = unlimited ? "Unlimited credits" : `${Math.trunc(raw)} credits`;
    const who =
      assignees.length === 1
        ? primaryAssignee.displayName
        : `${primaryAssignee.displayName} and ${assignees.length - 1} other ${assignees.length === 2 ? "member" : "members"}`;
    return `This will add ${product.name} (${creditsPart}) to ${who} at no charge.`;
  }, [products, selectedProductId, assignees, primaryAssignee]);

  const customConfirmCopy = useMemo(() => {
    const name = customName.trim();
    if (!name || !primaryAssignee) return "";
    const totalLabel = customUnlimited ? "Unlimited" : `${Math.trunc(Number(customCredits) || 0)} credits`;
    const who =
      assignees.length === 1
        ? primaryAssignee.displayName
        : `${primaryAssignee.displayName} and ${assignees.length - 1} other ${assignees.length === 2 ? "member" : "members"}`;
    return `This will add ${name} (${totalLabel}) to ${who} at no charge.`;
  }, [customName, customUnlimited, customCredits, assignees, primaryAssignee]);

  const openAssignConfirm = (kind: "existing" | "custom") => {
    if (kind === "existing") {
      if (!existingCategory) {
        toast.error("Select a category.");
        return;
      }
      if (!selectedProductId) {
        toast.error("Select a product.");
        return;
      }
    } else {
      const name = customName.trim();
      if (!name) {
        toast.error("Package name is required.");
        return;
      }
      if (!customUnlimited) {
        const n = Math.trunc(Number(customCredits));
        if (!Number.isFinite(n) || n < 1) {
          toast.error("Enter a valid number of credits (at least 1).");
          return;
        }
      }
      const vd = customValidityDays.trim();
      if (vd) {
        const days = Math.trunc(Number(vd));
        if (!Number.isFinite(days) || days < 1) {
          toast.error("Validity days must be a positive number or blank.");
          return;
        }
      }
    }
    setConfirmTab(kind);
    setConfirmOpen(true);
  };

  if (assignees.length === 0 || !primaryAssignee) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[90vh] max-w-lg overflow-y-auto"
        onPointerDownOutside={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest("[data-radix-select-content]") || t.closest('[role="listbox"]')) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest("[data-radix-select-content]") || t.closest('[role="listbox"]')) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Assign package</DialogTitle>
          <p className="text-left text-sm text-muted-foreground">
            {assignees.length > 1 ? (
              <>
                <span className="font-medium text-foreground">{assignees.length} members selected</span>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {assignees
                    .map((a) => a.displayName)
                    .join(", ")
                    .slice(0, 140)}
                  {assignees.map((a) => a.displayName).join(", ").length > 140 ? "…" : ""}
                </span>
              </>
            ) : (
              primaryAssignee.displayName
            )}
            <span className="block text-xs">No payment — manual credit grant</span>
          </p>
        </DialogHeader>

        {!canAssign ? (
          <p className="text-sm text-muted-foreground">
            Only directors and management can assign packages.
          </p>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "existing" | "custom")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger type="button" value="existing">
                Existing package
              </TabsTrigger>
              <TabsTrigger type="button" value="custom">
                Custom package
              </TabsTrigger>
            </TabsList>

            <TabsContent value="existing" className="space-y-4 pt-2">
              <div className="grid gap-2">
                <Label>Category</Label>
                {productsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading products…</p>
                ) : (
                  <Select
                    value={existingCategory || undefined}
                    onValueChange={(v) => {
                      setExistingCategory(v);
                      setSelectedProductId("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {existingCategoryOptions.map((slug) => (
                        <SelectItem key={slug} value={slug}>
                          {PRODUCT_CATEGORY_SLUG_LABEL[slug] ?? slug}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="grid gap-2">
                <Label>Product</Label>
                {productsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading products…</p>
                ) : !existingCategory ? (
                  <p className="text-sm text-muted-foreground">Choose a category first.</p>
                ) : productsInSelectedCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No products in this category.</p>
                ) : (
                  <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a product" />
                    </SelectTrigger>
                    <SelectContent>
                      {productsInSelectedCategory.map((p) => {
                        const cc =
                          p.credit_count == null
                            ? "—"
                            : p.credit_count >= UNLIMITED_PRODUCT_THRESHOLD
                              ? "Unlimited"
                              : String(p.credit_count);
                        return (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} · {cc} credits
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="assign-existing-note">Optional note</Label>
                <Textarea
                  id="assign-existing-note"
                  value={existingNote}
                  onChange={(e) => setExistingNote(e.target.value)}
                  rows={2}
                  placeholder="Shown in the member email if provided"
                />
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={
                    submitting ||
                    productsLoading ||
                    !existingCategory ||
                    !selectedProductId
                  }
                  className="bg-[#a3b693] text-white hover:bg-[#8fa67d]"
                  onClick={() => openAssignConfirm("existing")}
                >
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Assign
                </Button>
              </DialogFooter>
            </TabsContent>

            <TabsContent value="custom" className="space-y-4 pt-2">
              <div className="grid gap-2">
                <Label htmlFor="assign-custom-name">Package name</Label>
                <Input
                  id="assign-custom-name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Guest pass"
                />
              </div>
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select
                  value={customCategory}
                  onValueChange={(v) => setCustomCategory(v as CreditCategoryOrdered)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOM_CATEGORY_ITEMS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="grid flex-1 gap-2">
                  <Label htmlFor="assign-custom-credits">Number of credits</Label>
                  <Input
                    id="assign-custom-credits"
                    type="number"
                    min={1}
                    disabled={customUnlimited}
                    value={customCredits}
                    onChange={(e) => setCustomCredits(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    id="assign-custom-unlimited"
                    checked={customUnlimited}
                    onCheckedChange={setCustomUnlimited}
                  />
                  <Label htmlFor="assign-custom-unlimited" className="cursor-pointer text-sm">
                    Unlimited
                  </Label>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="assign-custom-validity">Validity days (optional)</Label>
                <Input
                  id="assign-custom-validity"
                  type="number"
                  min={1}
                  placeholder="Leave blank for no expiry"
                  value={customValidityDays}
                  onChange={(e) => setCustomValidityDays(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Allowed class types</Label>
                <div className="grid gap-2 rounded-lg border border-border p-3">
                  {CLASS_TYPE_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={customClassTypes.includes(opt.value)}
                        onCheckedChange={() => {
                          toggleClassType(opt.value);
                        }}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="assign-custom-note">Optional note</Label>
                <Textarea
                  id="assign-custom-note"
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  rows={2}
                  placeholder="Shown in the member email if provided"
                />
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={submitting}
                  className="bg-[#a3b693] text-white hover:bg-[#8fa67d]"
                  onClick={() => openAssignConfirm("custom")}
                >
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Assign
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm assignment</AlertDialogTitle>
            <AlertDialogDescription className="text-left text-sm text-muted-foreground">
              {confirmTab === "existing" ? existingConfirmCopy : customConfirmCopy}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={submitting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              disabled={submitting}
              className="bg-[#a3b693] text-white hover:bg-[#8fa67d] focus:ring-[#a3b693]"
              onClick={(e) => {
                e.preventDefault();
                void (confirmTab === "existing" ? assignExisting() : assignCustom());
              }}
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Assigning…
                </span>
              ) : (
                "Confirm"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
