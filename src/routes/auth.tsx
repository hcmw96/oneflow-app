import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getUser, supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import oneflowLogo from "@/assets/oneflow-logo.webp";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — One Flow" },
      { name: "description", content: "Sign in or create your One Flow account." },
    ],
  }),
  component: AuthPage,
});

async function resolveDestination(userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone, date_of_birth, role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.phone || !profile?.date_of_birth) return "/onboarding";
  if (profile.role && profile.role !== "customer") return "/admin";
  return "/";
}

export default function AuthPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        window.history.replaceState({}, "", "/auth");
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error && data.session?.user) {
          const dest = await resolveDestination(data.session.user.id);
          navigate({ to: dest });
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        const dest = await resolveDestination(session.user.id);
        navigate({ to: dest });
      }
    };
    void init();
  }, [navigate]);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      toast.error("Enter your email and password.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      if (error.message === "Invalid login credentials") {
        toast.error(
          "Incorrect email or password. If you signed up with Google, use the Google button below.",
        );
      } else {
        toast.error(error.message);
      }
      return;
    }
    const user = await getUser();
    if (user) {
      const dest = await resolveDestination(user.id);
      navigate({ to: dest });
    }
  };

  const handleSignUp = async () => {
    if (!email.trim() || !password || !confirmPassword) {
      toast.error("Fill in all fields.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data.session?.user) {
      navigate({ to: "/onboarding" });
      return;
    }
    toast.success("Check your email to confirm your account, then sign in.");
    setMode("signin");
    setPassword("");
    setConfirmPassword("");
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth`,
      },
    });
    if (error) {
      toast.error(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-10">
      <img src={oneflowLogo} alt="One Flow" className="mb-6 h-14 w-auto" />
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="font-display text-center text-xl font-semibold text-card-foreground">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          {mode === "signin" ? "Welcome back to One Flow." : "Join One Flow with email and password."}
        </p>

        {mode === "signin" ? (
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="auth-email">Email</Label>
              <Input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleSignIn()}
                placeholder="you@example.com"
                className="h-11 bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-password">Password</Label>
              <Input
                id="auth-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleSignIn()}
                placeholder="••••••••"
                className="h-11 bg-background"
              />
            </div>
            <button
              type="button"
              onClick={() =>
                toast.info("Contact support", {
                  description: "Password reset is not available in the app yet. Please reach out to the studio.",
                })
              }
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              Forgot password?
            </button>
            <Button
              type="button"
              onClick={() => void handleSignIn()}
              disabled={loading}
              className="h-11 w-full bg-primary text-base text-primary-foreground hover:bg-primary/90"
            >
              {loading ? "Signing in…" : "Sign In"}
            </Button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signup-email">Email</Label>
              <Input
                id="signup-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-password">Password</Label>
              <Input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="h-11 bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-confirm">Confirm password</Label>
              <Input
                id="signup-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleSignUp()}
                placeholder="Repeat password"
                className="h-11 bg-background"
              />
            </div>
            <Button
              type="button"
              onClick={() => void handleSignUp()}
              disabled={loading}
              className="h-11 w-full bg-primary text-base text-primary-foreground hover:bg-primary/90"
            >
              {loading ? "Creating…" : "Create Account"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              By creating an account you agree to our{" "}
              <button type="button" className="underline underline-offset-4">
                Terms
              </button>{" "}
              and{" "}
              <button type="button" className="underline underline-offset-4">
                Privacy Policy
              </button>
              .
            </p>
          </div>
        )}

        <Divider />
        <Button
          type="button"
          onClick={() => void signInWithGoogle()}
          variant="outline"
          className="h-11 w-full border-border bg-background"
          disabled={loading}
        >
          <GoogleIcon />
          Continue with Google
        </Button>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                className="font-semibold text-primary underline-offset-4 hover:underline"
                onClick={() => {
                  setMode("signup");
                  setPassword("");
                  setConfirmPassword("");
                }}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="font-semibold text-primary underline-offset-4 hover:underline"
                onClick={() => {
                  setMode("signin");
                  setPassword("");
                  setConfirmPassword("");
                }}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Need help?{" "}
        <a
          href="https://wa.me/27825533032"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline-offset-4 hover:underline"
        >
          Contact the studio
        </a>
      </p>
    </div>
  );
}

function Divider() {
  return (
    <div className="relative py-4">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-card px-2 text-muted-foreground">or</span>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
