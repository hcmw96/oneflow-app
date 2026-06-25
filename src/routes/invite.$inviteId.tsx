import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, Loader2, MapPin, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth";
import {
  consumePendingClassInviteId,
  fetchClassInvitePublic,
  formatInviteWhenLine,
  respondClassInvite,
  storePendingClassInviteId,
  type ClassInvitePublicPayload,
} from "@/lib/classInvite";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";
import oneflowLogo from "@/assets/oneflow-logo.webp";

export const Route = createFileRoute("/invite/$inviteId")({
  head: () => ({
    meta: [{ title: "Class invite — One Flow" }],
  }),
  component: ClassInvitePage,
});

function ClassInvitePage() {
  const { inviteId } = Route.useParams();
  const navigate = useNavigate();
  const { user, authReady } = useAuth();
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<"accept" | "decline" | null>(null);
  const [payload, setPayload] = useState<ClassInvitePublicPayload | null>(null);
  const [autoAcceptAfterSignup, setAutoAcceptAfterSignup] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchClassInvitePublic(inviteId);
      setPayload(data);
    } catch (e) {
      console.error("fetchClassInvitePublic", e);
      setPayload({ ok: false, code: "error" });
    } finally {
      setLoading(false);
    }
  }, [inviteId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!authReady || !user) return;
    const pending = consumePendingClassInviteId();
    if (pending && pending === inviteId) {
      setAutoAcceptAfterSignup(true);
      void reload();
    }
  }, [authReady, user, inviteId, reload]);

  const invite = payload?.invite;
  const cls = payload?.class;
  const inviterName = payload?.inviter_name ?? "A friend";
  const whenLine = cls?.starts_at ? formatInviteWhenLine(cls.starts_at) : "";

  const viewerEmail = (user?.email ?? "").trim().toLowerCase();
  const inviteEmail = (invite?.invitee_email ?? "").trim().toLowerCase();

  const viewerIsInvitee = useMemo(() => {
    if (!user) return false;
    if (invite?.invitee_id) return invite.invitee_id === user.id;
    if (inviteEmail && viewerEmail) return inviteEmail === viewerEmail;
    return false;
  }, [user, invite?.invitee_id, inviteEmail, viewerEmail]);

  const emailMismatch = Boolean(
    user && inviteEmail && viewerEmail && inviteEmail !== viewerEmail && invite?.invitee_id !== user.id,
  );

  const bookedIn = Boolean(invite?.booking_id);

  const isClosed =
    invite?.status === "declined" ||
    invite?.status === "cancelled" ||
    cls?.is_cancelled === true;

  const goAuth = (mode: "signin" | "signup") => {
    storePendingClassInviteId(inviteId);
    const params = new URLSearchParams();
    params.set("redirect", `/invite/${inviteId}`);
    if (mode === "signup" && inviteEmail) params.set("email", inviteEmail);
    if (mode === "signup") params.set("signup", "1");
    void navigate({ to: "/auth", search: Object.fromEntries(params) as Record<string, string> });
  };

  const handleAccept = async () => {
    if (!user) {
      goAuth("signup");
      return;
    }
    setActing("accept");
    try {
      const result = await respondClassInvite(inviteId, "accept");
      if (!result.ok) {
        toast.error(result.message ?? supabaseErrorMessage(result, "Could not accept invite"));
        setActing(null);
        return;
      }
      if (result.booked) {
        toast.success("You're booked in!");
        await reload();
        setActing(null);
        return;
      }
      if (result.next === "book" && result.class_id) {
        toast.success("Invite accepted — choose how to pay for the class.");
        void navigate({ to: "/schedule", search: { class: result.class_id } });
        setActing(null);
        return;
      }
      await reload();
    } catch (e) {
      toast.error(supabaseErrorMessage(e, "Could not accept invite"));
    } finally {
      setActing(null);
    }
  };

  useEffect(() => {
    if (!autoAcceptAfterSignup || loading || !payload?.ok || !user || acting) return;
    if (bookedIn || isClosed || emailMismatch || !viewerIsInvitee) {
      setAutoAcceptAfterSignup(false);
      return;
    }
    setAutoAcceptAfterSignup(false);
    void handleAccept();
  }, [
    autoAcceptAfterSignup,
    loading,
    payload?.ok,
    user,
    acting,
    bookedIn,
    isClosed,
    emailMismatch,
    viewerIsInvitee,
  ]);

  const handleDecline = async () => {
    if (!user) {
      toast.error("Sign in to decline this invite.");
      goAuth("signin");
      return;
    }
    setActing("decline");
    try {
      const result = await respondClassInvite(inviteId, "decline");
      if (!result.ok) {
        toast.error(result.message ?? "Could not decline invite");
        return;
      }
      toast.success("Invite declined");
      await reload();
    } catch (e) {
      toast.error(supabaseErrorMessage(e, "Could not decline invite"));
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#f5f5f0] px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <div className="bg-[#a3b693] px-6 py-8 text-center">
            <img src={oneflowLogo} alt="One Flow" className="mx-auto h-16 w-auto" />
          </div>

          <div className="px-6 py-6">
            {loading ? (
              <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-[#a3b693]" />
                <p className="text-sm">Loading invite…</p>
              </div>
            ) : !payload?.ok || !invite || !cls ? (
              <div className="py-8 text-center">
                <p className="font-semibold text-foreground">Invite not found</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  This link may have expired or is invalid.
                </p>
                <Button asChild className="mt-6" variant="outline">
                  <Link to="/">Go home</Link>
                </Button>
              </div>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#a3b693]">
                  Class invite
                </p>
                <h1 className="mt-2 font-display text-2xl font-bold leading-tight">
                  {inviterName} invited you
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Join <span className="font-semibold text-foreground">{cls.name}</span>
                  {whenLine ? ` · ${whenLine}` : ""}.
                </p>

                <div className="mt-5 space-y-2 rounded-xl border border-border/70 bg-muted/20 p-4 text-sm">
                  <p className="flex items-center gap-2 font-semibold">
                    <Calendar className="h-4 w-4 text-[#a3b693]" />
                    {cls.name}
                  </p>
                  {whenLine ? <p className="text-muted-foreground">{whenLine}</p> : null}
                  {cls.location ? (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4 shrink-0" />
                      {cls.location}
                    </p>
                  ) : null}
                  {cls.guide_name ? (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-4 w-4 shrink-0" />
                      {cls.guide_name}
                    </p>
                  ) : null}
                </div>

                {invite.paid_by_inviter ? (
                  <p className="mt-4 rounded-lg bg-[#e8efe3] px-3 py-2 text-xs text-[#3d4f36]">
                    {inviterName.split(/\s+/)[0] || "Your friend"} is paying for this class.
                  </p>
                ) : (
                  <p className="mt-4 text-xs text-muted-foreground">
                    After you accept, you&apos;ll book the class with your pass or payment.
                  </p>
                )}

                {cls.is_cancelled ? (
                  <p className="mt-6 text-center text-sm font-medium text-destructive">
                    This class has been cancelled.
                  </p>
                ) : isClosed ? (
                  <p className="mt-6 text-center text-sm text-muted-foreground">
                    This invite is no longer active.
                  </p>
                ) : bookedIn || invite.status === "completed" ? (
                  <div className="mt-6 space-y-3 text-center">
                    <p className="text-sm font-semibold text-[#3d4f36]">You&apos;re booked in!</p>
                    <Button asChild className="w-full bg-[#a3b693] text-white hover:bg-[#8fa67d]">
                      <Link to="/bookings">View my bookings</Link>
                    </Button>
                  </div>
                ) : emailMismatch ? (
                  <div className="mt-6 space-y-3">
                    <p className="text-center text-sm text-muted-foreground">
                      This invite was sent to <span className="font-medium">{invite.invitee_email}</span>.
                      Sign in with that email to respond.
                    </p>
                    <Button
                      type="button"
                      className="w-full"
                      variant="outline"
                      onClick={() => goAuth("signin")}
                    >
                      Sign in with another account
                    </Button>
                  </div>
                ) : !user ? (
                  <div className="mt-6 flex flex-col gap-2">
                    <Button
                      type="button"
                      className="w-full bg-[#a3b693] text-white hover:bg-[#8fa67d]"
                      disabled={acting !== null}
                      onClick={() => void handleAccept()}
                    >
                      {acting === "accept" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Accept & sign up
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={acting !== null}
                      onClick={() => goAuth("signin")}
                    >
                      I already have an account
                    </Button>
                  </div>
                ) : viewerIsInvitee ? (
                  <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      className="flex-1 bg-[#a3b693] text-white hover:bg-[#8fa67d]"
                      disabled={acting !== null}
                      onClick={() => void handleAccept()}
                    >
                      {acting === "accept" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Accept
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      disabled={acting !== null}
                      onClick={() => void handleDecline()}
                    >
                      {acting === "decline" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Decline
                    </Button>
                  </div>
                ) : (
                  <div className="mt-6">
                    <Button
                      type="button"
                      className="w-full bg-[#a3b693] text-white hover:bg-[#8fa67d]"
                      onClick={() => goAuth("signin")}
                    >
                      Sign in to respond
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
