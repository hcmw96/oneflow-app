import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  User as UserIcon,
  CreditCard,
  History,
  Users,
  Settings,
  Camera,
  LogOut,
  Bell,
  Search,
  UserPlus,
  ChevronRight,
  Shield,
  HelpCircle,
  LayoutGrid,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { formatRand } from "@/lib/format";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

async function signOut() {
  await supabase.auth.signOut();
  window.location.assign("/auth");
}

export const Route = createFileRoute("/me")({
  component: MePage,
});

type Tab = "personal" | "billing" | "history" | "friends" | "settings";

const TABS: { id: Tab; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "personal", icon: UserIcon },
  { id: "billing", icon: CreditCard },
  { id: "history", icon: History },
  { id: "friends", icon: Users },
  { id: "settings", icon: Settings },
];

const MOCK_FRIENDS = [
  { id: "f1", name: "Asha Naidoo", initials: "AN" },
  { id: "f2", name: "Liam Pretorius", initials: "LP" },
  { id: "f3", name: "Zinhle Khumalo", initials: "ZK" },
];

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

function MePage() {
  const [tab, setTab] = useState<Tab>("personal");
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [historyRows, setHistoryRows] = useState<{ id: string; label: string; date: Date }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setProfile(null);
      setEmail("");
      setHistoryRows([]);
      setLoading(false);
      return;
    }

    setEmail(user.email ?? "");

    const [{ data: prof }, { data: hist }] = await Promise.all([
      supabase
        .from("profiles")
        .select("first_name, last_name, email, phone")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("bookings")
        .select("id, classes ( name, starts_at )")
        .eq("profile_id", user.id)
        .eq("status", "attended")
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    setProfile(prof as ProfileRow | null);

    const rows =
      (hist ?? []).map((raw: Record<string, unknown>) => {
        const cls = raw.classes as { name: string; starts_at: string } | { name: string; starts_at: string }[] | null;
        const c = Array.isArray(cls) ? cls[0] : cls;
        return {
          id: raw.id as string,
          label: c?.name ?? "Class",
          date: new Date(c?.starts_at ?? Date.now()),
        };
      }) ?? [];
    setHistoryRows(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  const first = profile?.first_name?.trim() || "Member";
  const initials = (first.charAt(0) + (profile?.last_name?.charAt(0) || first.charAt(0))).toUpperCase();

  return (
    <AppShell>
      <div className="flex items-center justify-end px-5 pt-3">
        <button
          aria-label="Notifications"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
        >
          <Bell className="h-4 w-4" />
        </button>
      </div>

      <main className="flex-1 space-y-4 px-5 pt-3">
        <section className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
          <div className="relative shrink-0">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted text-xl font-bold text-foreground">
              {loading ? "…" : initials.slice(0, 2)}
            </div>
            <button
              aria-label="Change photo"
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-xl font-bold">
              {loading ? "…" : displayName || first}
            </h2>
            <p className="truncate text-sm text-muted-foreground">{email || profile?.email || "—"}</p>
            <p className="truncate text-sm text-muted-foreground">{profile?.phone || "—"}</p>
          </div>
          <button
            type="button"
            aria-label="Sign out"
            onClick={() => void signOut()}
            className="shrink-0 text-foreground/70"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </section>

        <nav className="flex items-center justify-between rounded-xl bg-muted p-1">
          {TABS.map(({ id, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-label={id}
                className={cn(
                  "flex flex-1 items-center justify-center rounded-lg py-2.5 transition-colors",
                  active ? "bg-card shadow-sm text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </nav>

        {tab === "personal" && (
          <PersonalPanel
            first={profile?.first_name ?? ""}
            last={profile?.last_name ?? ""}
            phone={profile?.phone ?? ""}
          />
        )}
        {tab === "billing" && <BillingPanel />}
        {tab === "history" && <HistoryPanel rows={historyRows} />}
        {tab === "friends" && <FriendsPanel />}
        {tab === "settings" && <SettingsPanel />}
      </main>
    </AppShell>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-display text-2xl font-bold">{title}</h3>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input
        defaultValue={value}
        className="mt-1.5 w-full rounded-lg border border-border bg-muted/60 px-4 py-3 text-sm outline-none focus:border-primary"
      />
    </div>
  );
}

function PersonalPanel({ first, last, phone }: { first: string; last: string; phone: string }) {
  return (
    <Panel title="Personal details">
      <Field label="First name" value={first} />
      <Field label="Last name" value={last} />
      <Field label="Phone" value={phone} />
      <Field label="Date of birth" value="" />
      <button className="mt-2 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground">
        Save changes
      </button>
    </Panel>
  );
}

function BillingPanel() {
  const invoices = [
    { id: "sample-1", name: "Studio pass (sample)", date: "—", amount: 0 },
  ];

  return (
    <Panel title="Billing history">
      <p className="text-sm text-muted-foreground">
        Purchases via Yoco and in-studio payments will appear here once linked.
      </p>
      <ul className="divide-y divide-border">
        {invoices.map((inv) => (
          <li key={inv.id} className="flex items-center justify-between gap-2 py-3 first:pt-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{inv.name}</p>
              <p className="text-xs text-muted-foreground">{inv.date}</p>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums">
              {inv.amount > 0 ? formatRand(inv.amount) : "—"}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function HistoryPanel({ rows }: { rows: { id: string; label: string; date: Date }[] }) {
  return (
    <Panel title="Class history">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No attended classes yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-3 first:pt-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{p.label}</p>
                <p className="text-xs text-muted-foreground">
                  {p.date.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-semibold text-foreground">
                Attended
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function FriendsPanel() {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => MOCK_FRIENDS.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())),
    [q],
  );

  return (
    <Panel title="Friends">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name"
          className="w-full rounded-lg border border-border bg-muted/60 py-3 pl-9 pr-3 text-sm outline-none focus:border-primary"
        />
      </div>
      <ul className="divide-y divide-border">
        {filtered.map((f) => (
          <li key={f.id} className="flex items-center gap-3 py-3 first:pt-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold">
              {f.initials}
            </div>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">{f.name}</p>
            <button type="button" className="shrink-0 text-muted-foreground">
              <ChevronRight className="h-4 w-4" />
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="py-4 text-center text-sm text-muted-foreground">No friends found.</li>
        )}
      </ul>
      <button
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-semibold"
      >
        <UserPlus className="h-4 w-4 shrink-0" aria-hidden /> Invite a friend
      </button>
    </Panel>
  );
}

function SettingsPanel() {
  return (
    <Panel title="Account settings">
      <Row icon={<Bell className="h-4 w-4" />} label="Notifications" />
      <Row icon={<Shield className="h-4 w-4" />} label="Privacy & waiver" />
      <Row icon={<HelpCircle className="h-4 w-4" />} label="FAQ & help" />
      <Link
        to="/admin"
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground">
          <LayoutGrid className="h-4 w-4" />
        </span>
        <span className="flex-1 text-sm font-semibold">Admin Dashboard</span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>
      <Row icon={<LogOut className="h-4 w-4" />} label="Sign out" danger onClick={() => void signOut()} />
    </Panel>
  );
}

function Row({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left"
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full",
          danger ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground",
        )}
      >
        {icon}
      </span>
      <span className={cn("flex-1 text-sm font-semibold", danger && "text-destructive")}>
        {label}
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
