import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import oneflowLogo from "@/assets/oneflow-logo.webp";

export const Route = createFileRoute("/auth/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — One Flow" },
      { name: "description", content: "Set a new password for your One Flow account." },
    ],
  }),
  component: ResetPasswordPage,
});

type Gate = "loading" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [gate, setGate] = useState<Gate>("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive && session) setGate("ready");
    });

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!alive) return;
        if (error) {
          console.error(error);
          setGate("invalid");
          return;
        }
        window.history.replaceState({}, "", "/auth/reset-password");
      }

      const getSess = async () => (await supabase.auth.getSession()).data.session;

      if (await getSess()) {
        if (alive) setGate("ready");
        return;
      }

      await new Promise((r) => setTimeout(r, 2000));
      if (!alive) return;
      if (await getSess()) setGate("ready");
      else setGate("invalid");
    })();

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  const submit = async () => {
    if (!password.trim() || !confirm.trim()) {
      toast.error("Enter and confirm your new password.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated.");
    navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-10">
      <img src={oneflowLogo} alt="One Flow" className="mb-6 h-14 w-auto" />
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="font-display text-center text-xl font-semibold text-card-foreground">
          New password
        </h1>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Choose a password for your One Flow account.
        </p>

        {gate === "loading" ? (
          <div className="mt-10 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
            <p className="text-sm text-muted-foreground">Verifying reset link…</p>
          </div>
        ) : gate === "invalid" ? (
          <div className="mt-8 space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              This reset link is invalid or has expired. Request a new one from the sign-in page.
            </p>
            <Button type="button" className="w-full" onClick={() => navigate({ to: "/auth" })}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-pw">New password</Label>
              <Input
                id="reset-pw"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="h-11 bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-confirm">Confirm password</Label>
              <Input
                id="reset-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submit()}
                placeholder="Repeat password"
                className="h-11 bg-background"
              />
            </div>
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="h-11 w-full text-base"
            >
              {submitting ? "Saving…" : "Update password"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
