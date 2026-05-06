import { useEffect, useState } from "react";
import { Clock, MapPin, Users, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { getUser, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface ClassRow {
  id: string;
  name: string;
  class_type: string;
  location: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked_count: number;
  guide_name?: string | null;
}

interface Credit {
  id: string;
  product_name: string;
  credits_remaining: number | null;
  is_unlimited: boolean;
  expires_at: string | null;
  allowed_class_types: string[] | null;
}

interface Props {
  session: ClassRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BookingSheet({ session, open, onOpenChange }: Props) {
  const [credits, setCredits] = useState<Credit[]>([]);
  const [selectedCredit, setSelectedCredit] = useState<string | null>(null);
  const [flowPoints, setFlowPoints] = useState(0);
  const [usePoints, setUsePoints] = useState(false);
  const [matAddon, setMatAddon] = useState(false);
  const [towelAddon, setTowelAddon] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !session) return;
    const load = async () => {
      const user = await getUser();
      if (!user) return;
      setUserId(user.id);
      setUserEmail(user.email ?? null);

      const [{ data: creditsData }, { data: pointsData }] = await Promise.all([
        supabase
          .from("user_credits")
          .select(
            "id, product_name, credits_remaining, is_unlimited, expires_at, allowed_class_types",
          )
          .eq("profile_id", user.id)
          .gte("expires_at", new Date().toISOString())
          .neq("category", "cafe")
          .order("expires_at"),
        supabase
          .from("flow_points_balance")
          .select("balance")
          .eq("profile_id", user.id)
          .maybeSingle(),
      ]);

      const eligible = (creditsData ?? []).filter((c) => {
        if (!c.allowed_class_types || c.allowed_class_types.length === 0) return true;
        return c.allowed_class_types.includes(session.class_type);
      });

      setCredits(eligible as Credit[]);
      setSelectedCredit(eligible[0]?.id ?? null);
      setFlowPoints(pointsData?.balance ?? 0);
    };
    void load();
  }, [open, session]);

  if (!session) return null;

  const spots = Math.max(0, session.capacity - session.booked_count);
  const dateLine = new Date(session.starts_at).toLocaleDateString("en-ZA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const timeLine = new Date(session.starts_at)
    .toLocaleTimeString("en-ZA", { hour: "numeric", minute: "2-digit", hour12: true })
    .toUpperCase();
  const durationMin = Math.round(
    (new Date(session.ends_at).getTime() - new Date(session.starts_at).getTime()) / 60000,
  );
  const isMayChallenge = ["yoga", "sauna_journey"].includes(session.class_type);
  const isMay = new Date(session.starts_at).getMonth() === 4;
  const pointsValue = Math.floor(flowPoints / 100) * 10;

  const confirm = async () => {
    if (!userId) return;
    if (!selectedCredit && !usePoints) {
      toast.error("Please select a payment method");
      return;
    }
    setLoading(true);

    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({
        profile_id: userId,
        class_id: session.id,
        status: "confirmed",
        payment_method: selectedCredit ? "credit" : "flow_points",
        credit_id: selectedCredit ?? null,
        flow_points_used: usePoints ? Math.min(flowPoints, 100) : 0,
        mat_addon: matAddon,
        towel_addon: towelAddon,
        qr_token: globalThis.crypto.randomUUID(),
      })
      .select()
      .single();

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    await supabase.from("flow_points").insert({
      profile_id: userId,
      points: 1,
      reason: "class_attended",
      reference_id: booking.id,
    });

    if (isMayChallenge && isMay) {
      await supabase.from("challenge_entries").insert({
        profile_id: userId,
        booking_id: booking.id,
        challenge_month: "2026-05-01",
      });
    }

    if (userEmail) {
      await supabase.functions.invoke("send-email", {
        body: {
          to: userEmail,
          template:
            session.class_type === "sauna_journey"
              ? "booking_confirmation_sauna"
              : "booking_confirmation_class",
          data: {
            class_name: session.name,
            starts_at: session.starts_at,
            date: dateLine,
            time: timeLine,
            guide_name: session.guide_name ?? "Guide",
            location: session.location,
            mat_addon: matAddon,
            towel_addon: towelAddon,
          },
        },
      });
    }

    toast.success("Booking confirmed!", {
      description: `${session.name} · ${dateLine} at ${timeLine}`,
    });
    setLoading(false);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto rounded-t-3xl border-0 bg-background p-0"
      >
        <div className="px-6 pb-8 pt-6">
          <SheetHeader className="text-center">
            <SheetTitle className="font-display text-2xl font-bold">{session.name}</SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              {dateLine} at {timeLine}
            </SheetDescription>
          </SheetHeader>

          <ul className="mt-6 space-y-2.5 text-sm text-muted-foreground">
            <li className="flex items-center gap-2.5">
              <Clock className="h-4 w-4" /> {durationMin} minutes
            </li>
            <li className="flex items-center gap-2.5">
              <MapPin className="h-4 w-4" /> {session.location}
            </li>
            <li className="flex items-center gap-2.5">
              <Users className="h-4 w-4" /> {spots} spots available
            </li>
          </ul>

          {isMayChallenge && isMay && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2.5 text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Counts toward 31 Days of Movement
            </div>
          )}

          {credits.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-4 text-center text-sm text-muted-foreground">
              No eligible credits for this class.{" "}
              <a href="/pricing" className="text-primary underline">
                Buy a pass
              </a>
            </div>
          ) : (
            <>
              <p className="mt-6 text-sm font-semibold">Select credit to use:</p>
              <div className="mt-2 space-y-2">
                {credits.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedCredit(c.id);
                      setUsePoints(false);
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-2xl border bg-card px-4 py-3.5 text-left transition-colors",
                      selectedCredit === c.id && !usePoints ? "border-primary" : "border-border",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                        selectedCredit === c.id && !usePoints
                          ? "border-primary"
                          : "border-muted-foreground/40",
                      )}
                    >
                      {selectedCredit === c.id && !usePoints && (
                        <span className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{c.product_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.is_unlimited ? "Unlimited" : `${c.credits_remaining} remaining`}
                        {c.expires_at &&
                          ` · Expires ${new Date(c.expires_at).toLocaleDateString("en-ZA")}`}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {flowPoints >= 100 && (
            <button
              type="button"
              onClick={() => {
                setUsePoints(true);
                setSelectedCredit(null);
              }}
              className={cn(
                "mt-2 flex w-full items-start gap-3 rounded-2xl border bg-card px-4 py-3.5 text-left transition-colors",
                usePoints ? "border-primary" : "border-border",
              )}
            >
              <span
                className={cn(
                  "mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                  usePoints ? "border-primary" : "border-muted-foreground/40",
                )}
              >
                {usePoints && <span className="h-2 w-2 rounded-full bg-primary" />}
              </span>
              <div>
                <p className="text-sm font-semibold">Flow Points</p>
                <p className="text-xs text-muted-foreground">
                  {flowPoints} pts · Worth R{pointsValue}
                </p>
              </div>
            </button>
          )}

          <p className="mt-6 text-sm font-semibold">Add-ons:</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setMatAddon((v) => !v)}
              className={cn(
                "flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-colors",
                matAddon ? "border-primary bg-primary/10" : "border-border bg-card",
              )}
            >
              🧘 Mat
            </button>
            <button
              type="button"
              onClick={() => setTowelAddon((v) => !v)}
              className={cn(
                "flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-colors",
                towelAddon ? "border-primary bg-primary/10" : "border-border bg-card",
              )}
            >
              🏷️ Towel
            </button>
          </div>

          <button
            type="button"
            onClick={() => void confirm()}
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-opacity active:opacity-90 disabled:opacity-50"
          >
            {loading ? "Confirming…" : "Confirm Booking"}
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="mt-2 w-full rounded-xl border border-border bg-card py-3.5 text-sm font-semibold"
          >
            Cancel
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
