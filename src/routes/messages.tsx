import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { MessageStudioButton } from "@/components/MessageStudioSheet";
import { getUser, supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [{ title: "Messages — One Flow" }],
  }),
  component: MessagesPage,
});

const TZ = "Africa/Johannesburg";

type StudioMessageRow = {
  id: string;
  subject: string | null;
  body: string;
  is_read: boolean;
  created_at: string;
};

type SentMessageRow = {
  id: string;
  subject: string | null;
  body: string;
  created_at: string;
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function markStudioMessageRead(messageId: string, profileId: string) {
  const { error: msgErr } = await supabase
    .from("studio_messages")
    .update({ is_read: true })
    .eq("id", messageId)
    .eq("to_profile_id", profileId);
  if (msgErr) throw msgErr;

  const { error: notifErr } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("profile_id", profileId)
    .eq("type", "message")
    .contains("metadata", { studio_message_id: messageId });
  if (notifErr) console.warn("mark notification read", notifErr);
}

function MessagesPage() {
  const [loading, setLoading] = useState(true);
  const [inbox, setInbox] = useState<StudioMessageRow[]>([]);
  const [sent, setSent] = useState<SentMessageRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const user = await getUser();
    if (!user) {
      setProfileId(null);
      setInbox([]);
      setSent([]);
      setLoading(false);
      return;
    }
    setProfileId(user.id);

    const [{ data: inboxRows, error: inboxErr }, { data: sentRows, error: sentErr }] =
      await Promise.all([
        supabase
          .from("studio_messages")
          .select("id, subject, body, is_read, created_at")
          .eq("to_profile_id", user.id)
          .in("message_type", ["direct", "announcement"])
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("member_messages")
          .select("id, subject, body, created_at")
          .eq("profile_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

    if (inboxErr) {
      console.error(inboxErr);
      toast.error(supabaseErrorMessage(inboxErr, "Could not load messages"));
    } else {
      setInbox((inboxRows ?? []) as StudioMessageRow[]);
    }
    if (sentErr) {
      console.error(sentErr);
    } else {
      setSent((sentRows ?? []) as SentMessageRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openMessage = async (row: StudioMessageRow) => {
    setSelectedId(row.id);
    const uid = profileId ?? (await getUser())?.id ?? null;
    if (!uid || row.is_read) return;
    try {
      await markStudioMessageRead(row.id, uid);
      setInbox((prev) => prev.map((m) => (m.id === row.id ? { ...m, is_read: true } : m)));
    } catch (e) {
      console.error(e);
      toast.error("Could not mark message as read");
    }
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
        <h1 className="font-display text-lg font-semibold">Messages</h1>
        <div className="ml-auto shrink-0">
          <MessageStudioButton className="h-10 gap-1.5 rounded-full bg-[#a3b693] px-3 text-xs font-semibold text-white hover:bg-[#8fa67d]" />
        </div>
      </header>

      <main className="space-y-6 px-5 pb-8 pt-2">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <section>
              <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                From One Flow
              </h2>
              {inbox.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
                  No messages from the studio yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {inbox.map((m) => {
                    const open = selectedId === m.id;
                    return (
                      <li
                        key={m.id}
                        className={cn(
                          "overflow-hidden rounded-xl border border-border bg-card shadow-sm",
                          !m.is_read && !open && "border-primary/30 bg-primary-soft/20",
                        )}
                      >
                        <button
                          type="button"
                          className="flex w-full flex-col gap-1 px-4 py-3 text-left"
                          onClick={() => void openMessage(m)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={cn(
                                "text-sm",
                                m.is_read ? "font-medium" : "font-semibold text-foreground",
                              )}
                            >
                              {m.subject?.trim() || "Message from One Flow"}
                            </p>
                            {!m.is_read ? (
                              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">{formatWhen(m.created_at)}</p>
                          {!open ? (
                            <p className="line-clamp-2 text-sm text-muted-foreground">{m.body}</p>
                          ) : null}
                        </button>
                        {open ? (
                          <div className="border-t border-border px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                            {m.body}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section>
              <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                You sent to the studio
              </h2>
              {sent.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
                  Use Message Studio to contact the studio.
                </p>
              ) : (
                <ul className="space-y-2">
                  {sent.map((m) => (
                    <li
                      key={m.id}
                      className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        <p className="text-sm font-medium">
                          {m.subject?.trim() || "Message to One Flow"}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{formatWhen(m.created_at)}</p>
                      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{m.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="text-center text-xs text-muted-foreground">
              <Link to="/notifications" className="underline underline-offset-2">
                Notification preferences
              </Link>
            </p>
          </>
        )}
      </main>
    </AppShell>
  );
}
