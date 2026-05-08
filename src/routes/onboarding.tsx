import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { applyStoredReferrerToProfile } from "@/lib/referral";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/auth";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Welcome — One Flow" },
      { name: "description", content: "Complete your One Flow member profile." },
    ],
  }),
  component: OnboardingPage,
});

/**
 * Before changing the final `.update()` payload, confirm columns in Supabase
 * (SQL editor):
 *
 *   select column_name
 *   from information_schema.columns
 *   where table_schema = 'public' and table_name = 'profiles'
 *   order by ordinal_position;
 *
 * This flow updates: first_name, last_name, phone, date_of_birth, avatar_url
 * (optional), waiver_accepted_at, onboarding_complete — adjust names to match
 * your schema if any differ (e.g. photo_url, waiver_signed_at).
 */

const LIABILITY_WAIVER = `One Flow Liability Waiver

By participating in classes, sauna sessions, and other activities at One Flow, you acknowledge that physical exercise and heat exposure involve inherent risks, including but not limited to injury, dehydration, dizziness, or aggravation of pre-existing medical conditions.

You agree that you are in good health and have consulted a physician where appropriate. You voluntarily assume all risks associated with your participation.

One Flow, its staff, and instructors are not liable for any injury, loss, or damage arising from your use of our facilities or services, except where prohibited by law.

You confirm that the information you have provided is accurate and that you will follow staff instructions and facility rules at all times.`;

const STEPS = 3;

function OnboardingPage() {
  const navigate = useNavigate();
  const { user, authReady, profile, profileReady } = useAuth();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [waiverAccepted, setWaiverAccepted] = useState(false);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  useEffect(() => {
    if (!authReady || !user || !profileReady) return;
    if (profile?.onboarding_complete !== true) return;
    const role = (profile.role ?? "").toLowerCase();
    const isStaff = role === "director" || role === "management" || role === "guide";
    navigate({ to: isStaff ? "/admin" : "/", replace: true });
  }, [authReady, user, profileReady, profile, navigate]);

  const validateStep1 = () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Please enter your first and last name.");
      return false;
    }
    if (!phone.trim() || phone.trim().length < 8) {
      toast.error("Please enter a valid phone number.");
      return false;
    }
    if (!dateOfBirth) {
      toast.error("Please enter your date of birth.");
      return false;
    }
    const dob = new Date(dateOfBirth);
    if (Number.isNaN(dob.getTime()) || dob > new Date()) {
      toast.error("Please enter a valid date of birth.");
      return false;
    }
    return true;
  };

  const goNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 3 && !waiverAccepted) {
      toast.error("Please accept the terms to continue.");
      return;
    }
    setStep((s) => Math.min(STEPS, s + 1));
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const finish = async () => {
    if (!waiverAccepted) {
      toast.error("Please accept the terms to continue.");
      return;
    }

    if (!user) {
      navigate({ to: "/auth" });
      return;
    }

    setSaving(true);

    let avatarUrl: string | null = null;
    if (photoFile) {
      const ext = (photoFile.name.split(".").pop() || "jpg").toLowerCase();
      const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${safeExt}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, photoFile, {
        cacheControl: "3600",
        upsert: true,
      });
      if (upErr) {
        console.error(upErr);
        toast.error(upErr.message);
        setSaving(false);
        return;
      }
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      avatarUrl = pub.publicUrl;
    }

    const payload: Record<string, unknown> = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim(),
      date_of_birth: dateOfBirth,
      onboarding_complete: true,
      waiver_accepted_at: new Date().toISOString(),
    };
    if (avatarUrl) payload.avatar_url = avatarUrl;

    const { error } = await supabase.from("profiles").update(payload).eq("id", user.id);

    if (error) {
      console.error(error);
      toast.error(error.message);
      setSaving(false);
      return;
    }

    await applyStoredReferrerToProfile(user.id);

    toast.success("You’re all set — welcome to One Flow.");
    navigate({ to: "/" });
  };

  if (!authReady) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  if (!user || !profileReady) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }

  if (profile?.onboarding_complete === true) return null;

  return (
    <div className="min-h-[100dvh] bg-background px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-6 text-center">
          <p className="font-display text-xl font-semibold text-foreground">One Flow</p>
          <p className="mt-1 text-sm text-muted-foreground">New member setup</p>
        </header>

        <div className="mb-6 flex gap-2" aria-label="Progress">
          {Array.from({ length: STEPS }, (_, i) => {
            const n = i + 1;
            const active = step === n;
            const done = step > n;
            return (
              <div key={n} className="flex-1">
                <div
                  className={cn(
                    "h-1.5 rounded-full transition-colors",
                    done || active ? "bg-primary" : "bg-muted",
                    active && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
                  )}
                />
                <p className="mt-1.5 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {n === 1 ? "Details" : n === 2 ? "Photo" : "Waiver"}
                </p>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-display text-lg font-semibold text-card-foreground">Personal details</h2>
              <p className="text-xs text-muted-foreground">All fields are required.</p>
              <div className="grid gap-2">
                <Label htmlFor="ob-first">First name</Label>
                <Input
                  id="ob-first"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="bg-background"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ob-last">Last name</Label>
                <Input
                  id="ob-last"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="bg-background"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ob-phone">Phone number</Label>
                <Input
                  id="ob-phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+27 …"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="bg-background"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ob-dob">Date of birth</Label>
                <Input
                  id="ob-dob"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="bg-background"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="font-display text-lg font-semibold text-card-foreground">Profile photo</h2>
              <p className="text-xs text-muted-foreground">Optional — JPG, PNG, or WebP.</p>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary-soft/30 px-4 py-8 transition-colors hover:bg-primary-soft/50">
                <Upload className="h-8 w-8 text-primary" aria-hidden />
                <span className="text-center text-sm font-medium text-foreground">Tap to choose a photo</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    setPhotoFile(f ?? null);
                  }}
                />
              </label>
              {photoPreview && (
                <div className="flex justify-center">
                  <img
                    src={photoPreview}
                    alt="Preview"
                    className="h-32 w-32 rounded-full border-2 border-border object-cover"
                  />
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="font-display text-lg font-semibold text-card-foreground">Liability waiver</h2>
              <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-background/80 p-3 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
                {LIABILITY_WAIVER}
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-border bg-background/50 p-3">
                <Checkbox
                  id="ob-waiver"
                  checked={waiverAccepted}
                  onCheckedChange={(v) => setWaiverAccepted(v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="ob-waiver" className="cursor-pointer text-sm font-medium leading-snug">
                  I agree to the terms
                </Label>
              </div>
            </div>
          )}

          <div className="mt-8 flex gap-2">
            {step > 1 ? (
              <Button type="button" variant="outline" className="flex-1" onClick={goBack}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Back
              </Button>
            ) : (
              <div className="flex-1" />
            )}
            {step < STEPS ? (
              <Button type="button" className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90" onClick={goNext}>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={saving}
                onClick={() => void finish()}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Complete"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
