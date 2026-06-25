import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getUser, supabase } from "@/lib/supabase";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [{ title: "Notifications — One Flow" }],
  }),
  component: NotificationsPage,
});

type Prefs = {
  class_reminders: boolean;
  booking_confirmations: boolean;
  cancellation_alerts: boolean;
  promotional_updates: boolean;
};

const DEFAULTS: Prefs = {
  class_reminders: true,
  booking_confirmations: true,
  cancellation_alerts: true,
  promotional_updates: false,
};

function mergePrefs(raw: unknown): Prefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULTS };
  const o = raw as Record<string, unknown>;
  return {
    class_reminders: o.class_reminders !== false,
    booking_confirmations: o.booking_confirmations !== false,
    cancellation_alerts: o.cancellation_alerts !== false,
    promotional_updates: o.promotional_updates === true,
  };
}

const ROWS: { key: keyof Prefs; label: string; description: string }[] = [
  {
    key: "class_reminders",
    label: "Class reminders",
    description: "Get a heads-up 1 hour before your booked class.",
  },
  {
    key: "booking_confirmations",
    label: "Booking confirmations",
    description: "When a booking is confirmed or updated.",
  },
  {
    key: "cancellation_alerts",
    label: "Cancellation alerts",
    description: "If a class you booked is cancelled or changed.",
  },
  {
    key: "promotional_updates",
    label: "Promotional updates",
    description: "Offers, challenges, and studio news.",
  },
];

function NotificationsPage() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const user = await getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("notification_preferences")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      console.error(error);
      toast.error("Could not load preferences");
    } else {
      setPrefs(mergePrefs(data?.notification_preferences));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = async (next: Prefs, key: keyof Prefs) => {
    const user = await getUser();
    if (!user) return;
    setSavingKey(key);
    const { error } = await supabase
      .from("profiles")
      .update({ notification_preferences: next })
      .eq("id", user.id);
    setSavingKey(null);
    if (error) {
      toast.error(error.message);
      void load();
      return;
    }
    setPrefs(next);
  };

  const toggle = (key: keyof Prefs, v: boolean) => {
    const next = { ...prefs, [key]: v };
    setPrefs(next);
    void persist(next, key);
  };

  return (
    <AppShell>
      <header className="safe-top flex items-center gap-3 px-5 pt-3 pb-2">
        <Link
          to="/me"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="font-display text-lg font-semibold">Notifications</h1>
      </header>

      <main className="flex-1 space-y-4 px-5 pb-10 pt-2">
        <p className="text-sm text-muted-foreground">
          Choose what we notify you about. Delivery via push or email will be enabled in a future
          update — your choices are saved now.
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {ROWS.map((row) => (
              <li key={row.key} className="flex items-start gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <Label htmlFor={`n-${row.key}`} className="text-sm font-semibold leading-snug">
                    {row.label}
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">{row.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                  {savingKey === row.key && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  <Switch
                    id={`n-${row.key}`}
                    checked={prefs[row.key]}
                    onCheckedChange={(v) => toggle(row.key, v)}
                    disabled={savingKey !== null}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
