import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";
import { groupProductsByDisplayCategory } from "@/lib/productCategories";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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

type ProductPick = {
  id: string;
  name: string;
  category: string | null;
  credit_count: number | null;
  validity_days: number | null;
  allowed_class_types: string[] | null;
};

type CustomCategory = "yoga" | "wellzone" | "all_access";

const CUSTOM_CATEGORIES: { value: CustomCategory; label: string }[] = [
  { value: "yoga", label: "Yoga" },
  { value: "wellzone", label: "Wellzone" },
  { value: "all_access", label: "All access" },
];

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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: AssignPackageTarget | null;
  canAssign: boolean;
  onAssigned?: () => void;
};

export function AssignPackageDialog({ open, onOpenChange, target, canAssign, onAssigned }: Props) {
  const [tab, setTab] = useState<"existing" | "custom">("existing");
  const [products, setProducts] = useState<ProductPick[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [existingNote, setExistingNote] = useState("");

  const [customName, setCustomName] = useState("");
  const [customCategory, setCustomCategory] = useState<CustomCategory>("yoga");
  const [customCredits, setCustomCredits] = useState("10");
  const [customUnlimited, setCustomUnlimited] = useState(false);
  const [customValidityDays, setCustomValidityDays] = useState("");
  const [customClassTypes, setCustomClassTypes] = useState<string[]>([]);
  const [customNote, setCustomNote] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const prevOpenRef = useRef(false);

  const resetForms = useCallback(() => {
    setTab("existing");
    setSelectedProductId("");
    setExistingNote("");
    setCustomName("");
    setCustomCategory("yoga");
    setCustomCredits("10");
    setCustomUnlimited(false);
    setCustomValidityDays("");
    setCustomClassTypes([]);
    setCustomNote("");
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
    if (!open || !target) return;

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
  }, [open, target?.profileId]);

  const productsByGroup = useMemo(
    () =>
      groupProductsByDisplayCategory(products, (a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [products],
  );

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
    if (!target || !canAssign) return;
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
    const { error } = await supabase.from("user_credits").insert({
      profile_id: target.profileId,
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
    });
    setSubmitting(false);

    if (error) {
      console.error(error);
      toast.error(supabaseErrorMessage(error, "Could not assign package"));
      return;
    }

    const first =
      (target.firstName?.trim() ||
        target.displayName.split(/\s+/)[0] ||
        "there") as string;
    await sendPackageEmail(
      target.email,
      first,
      product.name,
      productCreditsLine(total, isUnlimited),
      existingNote,
    );

    toast.success("Package assigned");
    onOpenChange(false);
    onAssigned?.();
  };

  const assignCustom = async () => {
    if (!target || !canAssign) return;
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
    const { error } = await supabase.from("user_credits").insert({
      profile_id: target.profileId,
      product_id: null,
      product_name: name,
      category: customCategory,
      allowed_class_types: customClassTypes,
      credits_total: total,
      credits_remaining: total,
      is_unlimited: isUnlimited,
      expires_at: expiresAt,
      yoco_payment_id: "manual_assignment",
    });
    setSubmitting(false);

    if (error) {
      console.error(error);
      toast.error(supabaseErrorMessage(error, "Could not assign package"));
      return;
    }

    const first =
      (target.firstName?.trim() ||
        target.displayName.split(/\s+/)[0] ||
        "there") as string;
    await sendPackageEmail(
      target.email,
      first,
      name,
      isUnlimited
        ? "Unlimited credits are now available and ready to use."
        : productCreditsLine(total, false),
      customNote,
    );

    toast.success("Package assigned");
    onOpenChange(false);
    onAssigned?.();
  };

  if (!target) return null;

  return (
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
            {target.displayName}
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
                <Label>Product</Label>
                {productsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading products…</p>
                ) : (
                  <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a product" />
                    </SelectTrigger>
                    <SelectContent>
                      {productsByGroup.map((section) => (
                        <SelectGroup key={section.label}>
                          <SelectLabel className="text-xs text-muted-foreground">
                            {section.label}
                          </SelectLabel>
                          {section.items.map((p) => {
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
                        </SelectGroup>
                      ))}
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
                  disabled={submitting || productsLoading || !selectedProductId}
                  className="bg-[#a3b693] text-white hover:bg-[#8fa67d]"
                  onClick={() => void assignExisting()}
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
                  onValueChange={(v) => setCustomCategory(v as CustomCategory)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOM_CATEGORIES.map((c) => (
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
                  onClick={() => void assignCustom()}
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
  );
}
