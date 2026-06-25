import { useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { pickNextUpcomingClassId } from "@/lib/checkInUpcoming";
import {
  bookingConfirmationEmailData,
  bookingConfirmationTemplateForClassType,
} from "@/lib/bookingConfirmationEmail";
import { walkInCheckInToastMessage } from "@/lib/flowPoints";
import { LIABILITY_WAIVER } from "@/lib/liabilityWaiver";
import { supabase } from "@/lib/supabase";
import { edgeFunctionErrorMessage, supabaseErrorMessage } from "@/lib/supabaseErrors";

const SAGE = "#a3b693";

type FutureClassRow = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  class_type: string;
  guide_name: string | null;
  location: string | null;
};

function formatClassOptionLabel(c: FutureClassRow): string {
  const when = new Date(c.starts_at).toLocaleString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${c.name} · ${when}`;
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
};

export function WalkInSheet({ open, onOpenChange, onDone }: Props) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [classId, setClassId] = useState("");
  const [futureClasses, setFutureClasses] = useState<FutureClassRow[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [waiverAgreed, setWaiverAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFirstName("");
    setLastName("");
    setEmail("");
    setClassId("");
    setWaiverAgreed(false);
    setFutureClasses([]);

    void (async () => {
      setLoadingClasses(true);
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, starts_at, ends_at, class_type, guide_name, location")
        .eq("is_cancelled", false)
        .gte("starts_at", nowIso)
        .order("starts_at")
        .limit(250);

      if (error) {
        console.error("walk-in: future classes load failed", error);
        toast.error(supabaseErrorMessage(error, "Could not load upcoming classes"));
        setFutureClasses([]);
        setLoadingClasses(false);
        return;
      }

      const rows = (data ?? []) as FutureClassRow[];
      setFutureClasses(rows);
      const defaultId = pickNextUpcomingClassId(rows);
      setClassId(defaultId ?? rows[0]?.id ?? "");
      setLoadingClasses(false);
    })();
  }, [open]);

  const memberDetailsComplete = useMemo(() => {
    return (
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      isValidEmail(email)
    );
  }, [firstName, lastName, email]);

  const canCheckIn =
    memberDetailsComplete &&
    Boolean(classId) &&
    waiverAgreed &&
    !saving &&
    !loadingClasses &&
    futureClasses.length > 0;

  const submit = async () => {
    const fn = firstName.trim();
    const ln = lastName.trim();
    const em = email.trim().toLowerCase();
    if (!fn || !ln || !em) {
      toast.error("First name, last name, and email are required.");
      return;
    }
    if (!isValidEmail(em)) {
      toast.error("Enter a valid email address.");
      return;
    }
    if (!classId) {
      toast.error("Choose a class.");
      return;
    }
    if (!waiverAgreed) {
      toast.error("The member must agree to the waiver before check-in.");
      return;
    }

    const displayName = `${fn} ${ln}`.trim();
    const session = futureClasses.find((c) => c.id === classId);

    setSaving(true);
    console.log("[walk-in] submit start", { email: em, classId, firstName: fn, lastName: ln });

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("walk-in-checkin", {
        body: {
          first_name: fn,
          last_name: ln,
          email: em,
          class_id: classId,
        },
      });

      if (fnErr) {
        console.error("[walk-in] error", fnErr, data);
        toast.error(
          await edgeFunctionErrorMessage(fnErr, data, "Walk-in check-in failed"),
        );
        setSaving(false);
        return;
      }

      const result = data as {
        ok?: boolean;
        error?: string;
        role?: string;
        debug?: {
          profile_lookup?: unknown;
          profile_create?: unknown;
          waiver_update?: unknown;
          booking_insert?: unknown;
          challenge_checkin?: unknown;
        };
      };

      console.log("[walk-in] after profile lookup by email", result.debug?.profile_lookup);

      if (result.debug?.profile_create) {
        console.log("[walk-in] after profile creation", result.debug.profile_create);
      }
      if (result.debug?.waiver_update) {
        console.log("[walk-in] after waiver update", result.debug.waiver_update);
      }
      console.log("[walk-in] after booking insert", result.debug?.booking_insert);
      if (result.debug?.challenge_checkin) {
        console.log("[walk-in] after challenge_checkins insert", result.debug.challenge_checkin);
      }

      if (!result?.ok) {
        console.error("[walk-in] error", result);
        toast.error(result.error ?? "Walk-in check-in failed");
        setSaving(false);
        return;
      }

      if (session?.starts_at) {
        await supabase.functions.invoke("send-email", {
          body: {
            to: em,
            template: bookingConfirmationTemplateForClassType(session.class_type),
            data: bookingConfirmationEmailData({
              className: session.name,
              startsAtIso: session.starts_at,
              guideName: session.guide_name,
              location: session.location,
              matAddon: false,
              towelAddon: false,
            }),
          },
        });
      }

      toast.success(walkInCheckInToastMessage(displayName, result.role ?? "customer"));
      setSaving(false);
      onOpenChange(false);
      onDone();
    } catch (err) {
      console.error("[walk-in] error", err);
      toast.error(supabaseErrorMessage(err, "Walk-in check-in failed"));
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Walk-in check-in</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="walkin-fn">
              First name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="walkin-fn"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="walkin-ln">
              Last name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="walkin-ln"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="walkin-email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="walkin-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Class</Label>
            <Select value={classId} onValueChange={setClassId} disabled={loadingClasses}>
              <SelectTrigger>
                <SelectValue
                  placeholder={loadingClasses ? "Loading classes…" : "Pick a class"}
                />
              </SelectTrigger>
              <SelectContent>
                {futureClasses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {formatClassOptionLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Defaults to the next upcoming class today; all future classes are listed.
            </p>
          </div>

          {memberDetailsComplete ? (
            <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                One Flow waiver
              </p>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border/60 bg-background px-3 py-2 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
                {LIABILITY_WAIVER}
              </div>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox
                  checked={waiverAgreed}
                  onCheckedChange={(v) => setWaiverAgreed(v === true)}
                  className="mt-0.5"
                />
                <span>Member has read and agrees to the waiver</span>
              </label>
            </div>
          ) : null}
        </div>
        <SheetFooter className="mt-6 flex-row justify-end gap-2">
          <SheetClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </SheetClose>
          <Button
            type="button"
            disabled={!canCheckIn}
            onClick={() => void submit()}
            className="gap-2 text-white hover:opacity-90"
            style={{ backgroundColor: SAGE }}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Check className="h-4 w-4 shrink-0" aria-hidden />
            )}
            Check in
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
