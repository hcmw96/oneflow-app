import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Clock, MapPin, Users, CreditCard, Sparkles, Package } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { TypeBadge } from "@/components/TypeBadge";
import { formatTime, formatRand } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getUser, supabase } from "@/lib/supabase";
import { displayClassType } from "@/types/studio";

export const Route = createFileRoute("/class/$classId")({
  component: ClassDetailPage,
  notFoundComponent: () => (
    <AppShell>
      <div className="p-8 text-center text-muted-foreground">Class not found.</div>
    </AppShell>
  ),
});

type PaymentMethod = "credit" | "yoco" | "points";

type GuideJoin = {
  profiles:
    | { first_name: string; last_name: string }
    | { first_name: string; last_name: string }[]
    | null;
};

type ClassDetail = {
  id: string;
  name: string;
  class_type: string;
  location: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked_count: number;
  description?: string | null;
  guide_name?: string | null;
  guides?: GuideJoin | GuideJoin[] | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function ClassDetailPage() {
  const { classId } = Route.useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<ClassDetail | null>(null);
  const [pointsBalance, setPointsBalance] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("credit");
  const [mat, setMat] = useState(false);
  const [towel, setTowel] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, user] = await Promise.all([
      supabase
        .from("classes")
        .select(
          "id, name, class_type, location, starts_at, ends_at, capacity, booked_count, description, guide_name, guides ( profiles ( first_name, last_name ) )",
        )
        .eq("id", classId)
        .maybeSingle(),
      getUser(),
    ]);

    if (error || !data) {
      setSession(null);
      setPointsBalance(0);
      setLoading(false);
      return;
    }

    setSession(data as unknown as ClassDetail);

    if (user) {
      const { data: bal } = await supabase
        .from("flow_points_balance")
        .select("balance")
        .eq("profile_id", user.id)
        .maybeSingle();
      setPointsBalance(bal?.balance ?? 0);
    } else {
      setPointsBalance(0);
    }
    setLoading(false);
  }, [classId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell>
        <div className="p-8 text-center text-muted-foreground">Class not found.</div>
      </AppShell>
    );
  }

  const badgeType = displayClassType(session.class_type);
  const startsAt = new Date(session.starts_at);
  const durationMin = Math.round(
    (new Date(session.ends_at).getTime() - startsAt.getTime()) / 60000,
  );
  const fillRatio = session.booked_count / Math.max(1, session.capacity);
  const full = fillRatio >= 1;
  const addOns = (mat ? 4000 : 0) + (towel ? 2500 : 0);

  const g = one(session.guides);
  const prof = g?.profiles;
  const p = one(prof);
  const guideNameFromJoin = p ? `${p.first_name} ${p.last_name}`.trim() : null;
  const guideName = guideNameFromJoin || session.guide_name?.trim() || null;
  const initials = guideName
    ? guideName
        .split(/\s+/)
        .map((s) => s[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : null;

  const confirm = () => {
    toast.success("Book from Schedule", {
      description: "Use the schedule tab to confirm with your credits or card.",
    });
    setTimeout(() => router.navigate({ to: "/schedule" }), 400);
  };

  return (
    <AppShell>
      <header className="safe-top flex items-center gap-3 px-5 pt-3 pb-2">
        <button
          type="button"
          onClick={() => router.history.back()}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-display text-lg font-semibold">Book class</h1>
      </header>

      <main className="flex-1 space-y-5 px-5 pt-2">
        <section className="rounded-3xl bg-primary-soft p-5">
          <TypeBadge type={badgeType} className="bg-card/60" />
          <h2 className="mt-2 font-display text-3xl font-semibold leading-tight">{session.name}</h2>
          {session.description?.trim() ? (
            <p className="mt-2 text-sm leading-relaxed text-foreground/85">
              {session.description.trim()}
            </p>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
            <Info icon={<Clock className="h-3.5 w-3.5" />}>
              {startsAt.toLocaleDateString("en-ZA", {
                weekday: "long",
                day: "numeric",
                month: "short",
              })}
            </Info>
            <Info icon={<Clock className="h-3.5 w-3.5" />}>
              {formatTime(startsAt)} · {durationMin}m
            </Info>
            <Info icon={<MapPin className="h-3.5 w-3.5" />}>{session.location}</Info>
            <Info icon={<Users className="h-3.5 w-3.5" />}>
              {session.booked_count}/{session.capacity}
            </Info>
          </div>
          {guideName && initials && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-card/70 p-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                {initials}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Guide</p>
                <p className="font-medium">{guideName}</p>
              </div>
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 font-display text-base font-semibold">Pay with</h3>
          <div className="space-y-2">
            <PayOption
              icon={<Package className="h-4 w-4" />}
              title="Use a credit"
              sub="Choose a pack on checkout"
              selected={method === "credit"}
              onClick={() => setMethod("credit")}
              right="Free"
            />
            <PayOption
              icon={<Sparkles className="h-4 w-4" />}
              title="Flow Points"
              sub={`Balance ${pointsBalance} pts · 1,800 needed`}
              selected={method === "points"}
              onClick={() => setMethod("points")}
              right={pointsBalance >= 1800 ? "1,800 pts" : "Not enough"}
              disabled={pointsBalance < 1800}
            />
            <PayOption
              icon={<CreditCard className="h-4 w-4" />}
              title="Card via Yoco"
              sub="Online checkout"
              selected={method === "yoco"}
              onClick={() => setMethod("yoco")}
              right={formatRand(18000)}
            />
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-display text-base font-semibold">Add-ons</h3>
          <div className="space-y-2">
            <AddOn label="Mat hire" price={4000} checked={mat} onChange={setMat} />
            <AddOn label="Towel" price={2500} checked={towel} onChange={setTowel} />
          </div>
        </section>

        {addOns > 0 && (
          <div className="flex items-center justify-between rounded-2xl bg-secondary p-4 text-sm">
            <span className="text-muted-foreground">Add-ons total</span>
            <span className="font-semibold tabular-nums">{formatRand(addOns)}</span>
          </div>
        )}

        <button
          type="button"
          onClick={confirm}
          disabled={full}
          className="mt-2 w-full rounded-2xl bg-primary py-4 font-display text-base font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
        >
          {full ? "Class is full — join waitlist" : "Continue to schedule"}
        </button>

        <Link to="/schedule" className="block py-2 text-center text-xs text-muted-foreground">
          Cancel and go back
        </Link>
      </main>
    </AppShell>
  );
}

function Info({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-foreground/80">
      {icon}
      {children}
    </span>
  );
}

function PayOption({
  icon,
  title,
  sub,
  selected,
  onClick,
  right,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  selected: boolean;
  onClick: () => void;
  right: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors",
        selected ? "border-primary bg-primary-soft" : "border-border bg-card",
        disabled && "opacity-50",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full",
          selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <span className="text-sm font-medium tabular-nums">{right}</span>
    </button>
  );
}

function AddOn({
  label,
  price,
  checked,
  onChange,
}: {
  label: string;
  price: number;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center justify-between rounded-2xl border p-3",
        checked ? "border-primary bg-primary-soft" : "border-border bg-card",
      )}
    >
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="text-sm tabular-nums text-muted-foreground">+{formatRand(price)}</span>
    </label>
  );
}
