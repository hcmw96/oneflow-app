import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { user, pointsHistory, packs } from "@/data/mock";
import { formatRand } from "@/lib/format";
import { cn } from "@/lib/utils";

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

function MePage() {
  const [tab, setTab] = useState<Tab>("personal");

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
        {/* Profile header card */}
        <section className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted text-xl font-bold text-foreground">
              {user.name.charAt(0)}
              {user.name.charAt(0)}
            </div>
            <button
              aria-label="Change photo"
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-xl font-bold">{user.name} Koles…</h2>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            <p className="truncate text-sm text-muted-foreground">06322554444</p>
          </div>
          <button aria-label="Sign out" className="text-foreground/70">
            <LogOut className="h-5 w-5" />
          </button>
        </section>

        {/* Sub tabs */}
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

        {/* Tab content */}
        {tab === "personal" && <PersonalPanel />}
        {tab === "billing" && <BillingPanel />}
        {tab === "history" && <HistoryPanel />}
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

function PersonalPanel() {
  return (
    <Panel title="Personal details">
      <Field label="First name" value="Mia" />
      <Field label="Last name" value="Naidoo" />
      <Field label="Phone" value="0832004499" />
      <Field label="Date of birth" value="1995-04-12" />
      <button className="mt-2 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground">
        Save changes
      </button>
    </Panel>
  );
}

function BillingPanel() {
  // Mock past invoices using packs
  const invoices = packs.slice(0, 4).map((p, i) => ({
    id: p.id,
    name: p.name,
    date: new Date(Date.now() - (i + 1) * 1000 * 60 * 60 * 24 * 21).toLocaleDateString("en-ZA", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    amount: p.priceCents,
  }));

  return (
    <Panel title="Billing history">
      <ul className="divide-y divide-border">
        {invoices.map((inv) => (
          <li key={inv.id} className="flex items-center justify-between py-3 first:pt-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{inv.name}</p>
              <p className="text-xs text-muted-foreground">{inv.date}</p>
            </div>
            <span className="text-sm font-semibold tabular-nums">{formatRand(inv.amount)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function HistoryPanel() {
  return (
    <Panel title="Class history">
      <ul className="divide-y divide-border">
        {pointsHistory
          .filter((p) => p.delta <= 5)
          .map((p) => (
            <li key={p.id} className="flex items-center justify-between py-3 first:pt-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{p.label}</p>
                <p className="text-xs text-muted-foreground">
                  {p.date.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}
                </p>
              </div>
              <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-semibold text-foreground">
                Attended
              </span>
            </li>
          ))}
      </ul>
    </Panel>
  );
}

const MOCK_FRIENDS = [
  { id: "f1", name: "Asha Naidoo", initials: "AN" },
  { id: "f2", name: "Liam Pretorius", initials: "LP" },
  { id: "f3", name: "Zinhle Khumalo", initials: "ZK" },
  { id: "f4", name: "Mika Sato", initials: "MS" },
  { id: "f5", name: "Tendai Moyo", initials: "TM" },
];

function FriendsPanel() {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () =>
      MOCK_FRIENDS.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())),
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
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold">
              {f.initials}
            </div>
            <p className="flex-1 text-sm font-semibold">{f.name}</p>
            <button className="text-muted-foreground">
              <ChevronRight className="h-4 w-4" />
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="py-4 text-center text-sm text-muted-foreground">No friends found.</li>
        )}
      </ul>
      <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-semibold">
        <UserPlus className="h-4 w-4" /> Invite a friend
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
      <Row icon={<LogOut className="h-4 w-4" />} label="Sign out" danger />
    </Panel>
  );
}

function Row({
  icon,
  label,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
}) {
  return (
    <button className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left">
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
