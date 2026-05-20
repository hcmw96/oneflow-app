import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getUser, supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";
import { allowedClassTypeCheckboxOptions } from "@/lib/allowedClassTypes";
import {
  fetchCustomClassTypes,
  saveCustomClassTypes,
  slugifyClassTypeName,
  type CustomClassType,
} from "@/lib/classTypeOptions";

export const Route = createFileRoute("/admin/classes")({
  head: () => ({
    meta: [{ title: "Classes — One Flow Admin" }],
  }),
  component: ClassesCatalogPage,
});

function ClassesCatalogPage() {
  const [role, setRole] = useState<string | null>(null);
  const [custom, setCustom] = useState<CustomClassType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomClassType | null>(null);

  const isGuide = (role ?? "").toLowerCase() === "guide";
  const canManage = !isGuide;

  const reload = useCallback(async () => {
    setLoading(true);
    const types = await fetchCustomClassTypes();
    setCustom(types);
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      const user = await getUser();
      if (!user) {
        setRole(null);
        await reload();
        return;
      }
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      setRole((data?.role as string | null) ?? null);
      await reload();
    })();
  }, [reload]);

  const builtins = allowedClassTypeCheckboxOptions();

  const persistCustom = async (next: CustomClassType[]) => {
    setSaving(true);
    const { error } = await saveCustomClassTypes(next);
    setSaving(false);
    if (error) {
      toast.error(supabaseErrorMessage(error, "Could not save class types"));
      return false;
    }
    setCustom(next);
    toast.success("Class types saved");
    return true;
  };

  const addCustom = async () => {
    const label = newLabel.trim();
    if (!label) {
      toast.error("Enter a display name");
      return;
    }
    const slug = slugifyClassTypeName(label);
    if (!slug) {
      toast.error("Use letters or numbers in the name");
      return;
    }
    if (custom.some((c) => c.slug === slug)) {
      toast.error("That slug already exists");
      return;
    }
    if (builtins.some((b) => b.value === slug)) {
      toast.error("That matches a built-in type");
      return;
    }
    const next = [...custom, { slug, label }];
    if (await persistCustom(next)) {
      setNewLabel("");
      setDialogOpen(false);
    }
  };

  const removeCustom = async (t: CustomClassType) => {
    const next = custom.filter((c) => c.slug !== t.slug);
    if (await persistCustom(next)) setDeleteTarget(null);
  };

  return (
    <div>
      <PageHeader
        title="Classes"
        description={
          isGuide
            ? "Class types available when scheduling (view only)."
            : "Built-in and custom class types used on the schedule and in products. Add sessions on Schedule."
        }
        actions={
          canManage ? (
            <Button
              type="button"
              className="gap-2 bg-[#a3b693] text-white hover:bg-[#8fa67d]"
              asChild
            >
              <Link to="/admin/schedule">
                <CalendarDays className="h-4 w-4" />
                Open schedule
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-6 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Types listed here appear in the <strong>New class</strong> and <strong>Edit</strong> dialogs
          on <Link to="/admin/schedule" className="font-semibold text-[#4a6b3c] underline underline-offset-2">Schedule</Link>. Products and passes can also reference these slugs when limiting which classes a credit covers.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" aria-label="Loading" />
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-[#3d4f36]">
              Built-in types
            </h2>
            <div className="overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Slug</th>
                    <th className="px-4 py-3 font-medium">Label</th>
                  </tr>
                </thead>
                <tbody>
                  {builtins.map((row) => (
                    <tr key={row.value} className="border-t border-border">
                      <td className="px-4 py-3 font-mono text-xs">{row.value}</td>
                      <td className="px-4 py-3">{row.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-[#3d4f36]">
                Custom types
              </h2>
              {canManage ? (
                <Button type="button" size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add custom type
                </Button>
              ) : null}
            </div>
            {custom.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                No custom class types yet.
                {canManage ? " Add one to extend the built-in list." : ""}
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Slug</th>
                      <th className="px-4 py-3 font-medium">Label</th>
                      {canManage ? <th className="px-4 py-3 font-medium text-right">Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {custom.map((row) => (
                      <tr key={row.slug} className="border-t border-border">
                        <td className="px-4 py-3 font-mono text-xs">{row.slug}</td>
                        <td className="px-4 py-3">{row.label}</td>
                        {canManage ? (
                          <td className="px-4 py-3 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteTarget(row)}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                              Remove
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add custom class type</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label htmlFor="custom-type-label">Display name</Label>
              <Input
                id="custom-type-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Reformer Pilates"
                disabled={saving}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                A URL-safe slug is generated automatically from the name.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void addCustom()}
              className="bg-[#a3b693] text-white hover:bg-[#8fa67d]"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add type
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove custom type?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `“${deleteTarget.label}” (${deleteTarget.slug}) will no longer appear in schedule type lists. Existing scheduled sessions keep their stored type.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) void removeCustom(deleteTarget);
              }}
              disabled={saving}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
