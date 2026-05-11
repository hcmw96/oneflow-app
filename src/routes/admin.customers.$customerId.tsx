import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Calendar, Mail, Package, Phone, Shield, User } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import {
  AssignPackageDialog,
  type AssignPackageTarget,
} from "@/components/admin/AssignPackageDialog";
import { Button } from "@/components/ui/button";
import { getUser, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/customers/$customerId")({
  head: () => ({
    meta: [{ title: "Customer — One Flow Admin" }],
  }),
  component: CustomerProfilePage,
});

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  role: string | null;
  avatar_url: string | null;
  waiver_accepted_at: string | null;
  created_at?: string | null;
};

type CreditRow = {
  id: string;
  product_name: string | null;
  credits_remaining: number | null;
  is_unlimited: boolean | null;
  expires_at: string | null;
};

type BookingRow = {
  id: string;
  status: string;
  created_at: string;
  classes: { name: string; starts_at: string } | { name: string; starts_at: string }[] | null;
};

function oneClass(c: BookingRow["classes"]): { name: string; starts_at: string } | null {
  if (!c) return null;
  return Array.isArray(c) ? (c[0] ?? null) : c;
}

function CustomerProfilePage() {
  const { customerId } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<AssignPackageTarget | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [credits, setCredits] = useState<CreditRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);

  const canAssignPackages =
    (viewerRole ?? "").toLowerCase() === "director" ||
    (viewerRole ?? "").toLowerCase() === "management";

  useEffect(() => {
    void (async () => {
      const user = await getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      setViewerRole((data?.role as string | null) ?? null);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: p, error: pErr } = await supabase
      .from("profiles")
      .select(
        "id, first_name, last_name, email, phone, date_of_birth, role, avatar_url, waiver_accepted_at, created_at",
      )
      .eq("id", customerId)
      .maybeSingle();

    if (pErr || !p) {
      console.error(pErr);
      setProfile(null);
      setCredits([]);
      setBookings([]);
      setLoading(false);
      return;
    }

    setProfile(p as ProfileRow);

    const [{ data: cr }, { data: bk }] = await Promise.all([
      supabase
        .from("user_credits")
        .select("id, product_name, credits_remaining, is_unlimited, expires_at")
        .eq("profile_id", customerId),
      supabase
        .from("bookings")
        .select(
          `
          id,
          status,
          created_at,
          classes ( name, starts_at )
        `,
        )
        .eq("profile_id", customerId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const now = Date.now();
    const active = (cr ?? []).filter((row) => {
      const c = row as CreditRow;
      if (c.is_unlimited) return true;
      if (c.expires_at && new Date(c.expires_at).getTime() < now) return false;
      const rem = c.credits_remaining ?? 0;
      return rem > 0;
    }) as CreditRow[];

    setCredits(active);
    setBookings((bk ?? []) as BookingRow[]);
    setLoading(false);
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div>
        <PageHeader title="Customer" description="Loading…" />
        <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div>
        <PageHeader title="Customer" description="Not found" />
        <p className="text-sm text-muted-foreground">
          <Link to="/admin/customers" className="text-primary underline">
            Back to customers
          </Link>
        </p>
      </div>
    );
  }

  const fullName =
    [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() || "Member";
  const avatar = profile.avatar_url?.trim();

  return (
    <div>
      <div className="mb-4">
        <Link
          to="/admin/customers"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Customers
        </Link>
      </div>

      <PageHeader
        title={fullName}
        description="Member profile"
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!canAssignPackages}
            onClick={() => {
              setAssignTarget({
                profileId: profile.id,
                displayName: fullName,
                email: profile.email?.trim() || null,
                firstName: profile.first_name,
              });
              setAssignOpen(true);
            }}
          >
            <Package className="h-4 w-4 shrink-0" aria-hidden />
            Assign package
          </Button>
        }
      />

      <AssignPackageDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        target={assignTarget}
        canAssign={canAssignPackages}
        onAssigned={() => void load()}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-col items-center text-center">
            {avatar ? (
              <img
                src={avatar}
                alt=""
                className="h-24 w-24 rounded-full object-cover ring-2 ring-border"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted text-2xl font-bold text-muted-foreground">
                {fullName
                  .split(/\s+/)
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
            )}
            <h2 className="mt-4 font-display text-xl font-bold">{fullName}</h2>
            <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              {profile.role ?? "—"}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Joined{" "}
              {profile.created_at
                ? new Date(profile.created_at).toLocaleDateString("en-ZA", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "—"}
            </p>
          </div>

          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex gap-2">
              <dt className="flex w-28 shrink-0 items-center gap-1.5 text-muted-foreground">
                <Mail className="h-3.5 w-3.5" /> Email
              </dt>
              <dd className="min-w-0 break-all">{profile.email ?? "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="flex w-28 shrink-0 items-center gap-1.5 text-muted-foreground">
                <Phone className="h-3.5 w-3.5" /> Phone
              </dt>
              <dd>{profile.phone?.trim() || "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="flex w-28 shrink-0 items-center gap-1.5 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" /> DOB
              </dt>
              <dd>
                {profile.date_of_birth
                  ? new Date(profile.date_of_birth).toLocaleDateString("en-ZA")
                  : "—"}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="flex w-28 shrink-0 items-center gap-1.5 text-muted-foreground">
                <User className="h-3.5 w-3.5" /> Waiver
              </dt>
              <dd>
                {profile.waiver_accepted_at
                  ? `Signed ${new Date(profile.waiver_accepted_at).toLocaleDateString("en-ZA")}`
                  : "Not signed"}
              </dd>
            </div>
          </dl>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-6">
            <h3 className="font-display text-base font-semibold">Active credits</h3>
            {credits.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No active credits.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {credits.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border/80 bg-muted/20 px-3 py-2"
                  >
                    <span className="font-medium">{c.product_name ?? "Pass"}</span>
                    <span className="text-muted-foreground">
                      {c.is_unlimited ? "Unlimited" : `${c.credits_remaining ?? 0} left`}
                      {c.expires_at
                        ? ` · exp ${new Date(c.expires_at).toLocaleDateString("en-ZA")}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <h3 className="font-display text-base font-semibold">Recent bookings</h3>
            {bookings.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No bookings yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="pb-2 pr-4 font-medium">Class</th>
                      <th className="pb-2 pr-4 font-medium">When</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((b) => {
                      const cls = oneClass(b.classes);
                      const when = cls?.starts_at
                        ? new Date(cls.starts_at).toLocaleString("en-ZA", {
                            day: "numeric",
                            month: "short",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "—";
                      return (
                        <tr key={b.id} className="border-t border-border">
                          <td className="py-2 pr-4 font-medium">{cls?.name ?? "—"}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{when}</td>
                          <td className="py-2">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                                b.status === "confirmed"
                                  ? "bg-success/20 text-success-foreground"
                                  : b.status === "cancelled"
                                    ? "bg-muted text-muted-foreground"
                                    : "bg-primary/15 text-primary",
                              )}
                            >
                              {b.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
