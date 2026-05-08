import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  Megaphone,
  Search,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getUser, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/client-comms")({
  head: () => ({ meta: [{ title: "Client Comms — One Flow Admin" }] }),
  component: ClientCommsPage,
});

const TZ = "Africa/Johannesburg";
const PAGE_SIZE = 20;

type MessageRow = {
  id: string;
  from_profile_id: string | null;
  to_profile_id: string | null;
  subject: string | null;
  body: string;
  is_read: boolean;
  message_type: "direct" | "broadcast" | "announcement";
  created_at: string;
  fromName: string;
  toName: string;
};

type ProfileLite = { id: string; fullName: string; email: string };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ClientCommsPage() {
  const [tab, setTab] = useState<string>("inbox");
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [members, setMembers] = useState<ProfileLite[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Inbox / Sent filters
  const [inboxQuery, setInboxQuery] = useState("");
  const [sentQuery, setSentQuery] = useState("");
  const [inboxPage, setInboxPage] = useState(1);
  const [sentPage, setSentPage] = useState(1);

  // Send tab
  const [sendSearch, setSendSearch] = useState("");
  const [sendToId, setSendToId] = useState<string>("");
  const [sendSubject, setSendSubject] = useState("");
  const [sendBody, setSendBody] = useState("");
  const [sending, setSending] = useState(false);

  // Announcements
  const [annSubject, setAnnSubject] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [annSending, setAnnSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const user = await getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setMe(user.id);

    const [msgsRes, membersRes] = await Promise.all([
      supabase
        .from("studio_messages")
        .select("id, from_profile_id, to_profile_id, subject, body, is_read, message_type, created_at")
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("profiles")
        .select("id, first_name, last_name, email, role")
        .order("first_name", { ascending: true })
        .limit(2000),
    ]);

    const profileMap = new Map<string, string>();
    if (membersRes.data) {
      for (const p of membersRes.data as Record<string, unknown>[]) {
        const fn = String(p.first_name ?? "").trim();
        const ln = String(p.last_name ?? "").trim();
        const name = `${fn} ${ln}`.trim() || String(p.email ?? "Member");
        profileMap.set(String(p.id), name);
      }
      setMembers(
        (membersRes.data as Record<string, unknown>[])
          .filter((p) => String(p.role ?? "").toLowerCase() === "customer")
          .map((p) => ({
            id: String(p.id),
            fullName:
              `${p.first_name ?? ""} ${p.last_name ?? ""}`.toString().trim() ||
              String(p.email ?? "Member"),
            email: String(p.email ?? ""),
          })),
      );
    }

    if (msgsRes.error) {
      console.error(msgsRes.error);
      toast.error(msgsRes.error.message || "Could not load messages");
      setMessages([]);
    } else {
      const rows: MessageRow[] = (msgsRes.data ?? []).map((raw: Record<string, unknown>) => ({
        id: String(raw.id),
        from_profile_id: (raw.from_profile_id as string | null) ?? null,
        to_profile_id: (raw.to_profile_id as string | null) ?? null,
        subject: (raw.subject as string | null) ?? null,
        body: String(raw.body ?? ""),
        is_read: Boolean(raw.is_read),
        message_type: ((raw.message_type as string) ?? "direct") as MessageRow["message_type"],
        created_at: String(raw.created_at ?? new Date().toISOString()),
        fromName:
          (raw.from_profile_id ? profileMap.get(String(raw.from_profile_id)) : null) ?? "—",
        toName:
          (raw.to_profile_id ? profileMap.get(String(raw.to_profile_id)) : null) ??
          (raw.message_type === "announcement" ? "All members" : "—"),
      }));
      setMessages(rows);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const inbox = useMemo(() => {
    const q = inboxQuery.trim().toLowerCase();
    return messages
      .filter((m) => m.to_profile_id === me || m.message_type === "announcement")
      .filter((m) =>
        !q || `${m.fromName} ${m.subject ?? ""} ${m.body}`.toLowerCase().includes(q),
      );
  }, [messages, me, inboxQuery]);

  const sent = useMemo(() => {
    const q = sentQuery.trim().toLowerCase();
    return messages
      .filter((m) => m.from_profile_id === me)
      .filter((m) =>
        !q || `${m.toName} ${m.subject ?? ""} ${m.body}`.toLowerCase().includes(q),
      );
  }, [messages, me, sentQuery]);

  const announcements = useMemo(
    () => messages.filter((m) => m.message_type === "announcement"),
    [messages],
  );

  useEffect(() => {
    setInboxPage(1);
  }, [inboxQuery]);
  useEffect(() => {
    setSentPage(1);
  }, [sentQuery]);

  const inboxPageCount = Math.max(1, Math.ceil(inbox.length / PAGE_SIZE));
  const inboxRows = inbox.slice((inboxPage - 1) * PAGE_SIZE, inboxPage * PAGE_SIZE);
  const sentPageCount = Math.max(1, Math.ceil(sent.length / PAGE_SIZE));
  const sentRows = sent.slice((sentPage - 1) * PAGE_SIZE, sentPage * PAGE_SIZE);

  const unreadCount = inbox.filter((m) => !m.is_read).length;

  const markRead = async (id: string) => {
    const { error } = await supabase
      .from("studio_messages")
      .update({ is_read: true })
      .eq("id", id);
    if (error) {
      console.error(error);
      return;
    }
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, is_read: true } : m)));
  };

  const sendDirect = async () => {
    if (!sendToId) {
      toast.error("Pick a recipient");
      return;
    }
    if (!sendBody.trim() && !sendSubject.trim()) {
      toast.error("Add a subject or body");
      return;
    }
    setSending(true);
    const user = await getUser();
    const { error: msgErr } = await supabase.from("studio_messages").insert({
      from_profile_id: user?.id ?? null,
      to_profile_id: sendToId,
      subject: sendSubject.trim() || null,
      body: sendBody.trim(),
      message_type: "direct",
    });
    if (msgErr) {
      setSending(false);
      toast.error(msgErr.message || "Could not send");
      return;
    }
    await supabase.from("notifications").insert({
      profile_id: sendToId,
      type: "message",
      title: sendSubject.trim() || "New message",
      body: sendBody.trim().slice(0, 200) || null,
    });
    setSending(false);
    setSendSubject("");
    setSendBody("");
    setSendToId("");
    setSendSearch("");
    toast.success("Message sent");
    await load();
  };

  const sendAnnouncement = async () => {
    if (!annSubject.trim() && !annBody.trim()) {
      toast.error("Add a subject or body");
      return;
    }
    setAnnSending(true);
    const user = await getUser();
    const { data: targets, error: tErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "customer");
    if (tErr) {
      setAnnSending(false);
      toast.error(tErr.message || "Could not load recipients");
      return;
    }
    const ids = (targets ?? []).map((p: { id: string }) => p.id);
    if (ids.length === 0) {
      setAnnSending(false);
      toast.error("No active members to announce to");
      return;
    }
    const messageInserts = ids.map((id: string) => ({
      from_profile_id: user?.id ?? null,
      to_profile_id: id,
      subject: annSubject.trim() || null,
      body: annBody.trim(),
      message_type: "announcement" as const,
    }));
    const notifInserts = ids.map((id: string) => ({
      profile_id: id,
      type: "announcement",
      title: annSubject.trim() || "Studio announcement",
      body: annBody.trim().slice(0, 200) || null,
    }));
    const [mRes, nRes] = await Promise.all([
      supabase.from("studio_messages").insert(messageInserts),
      supabase.from("notifications").insert(notifInserts),
    ]);
    setAnnSending(false);
    if (mRes.error) {
      toast.error(mRes.error.message || "Could not send announcement");
      return;
    }
    if (nRes.error) console.warn("notifications insert", nRes.error);
    setAnnSubject("");
    setAnnBody("");
    toast.success(`Announcement sent to ${ids.length} member${ids.length === 1 ? "" : "s"}`);
    await load();
  };

  const filteredMembers = useMemo(() => {
    const q = sendSearch.trim().toLowerCase();
    if (!q) return members.slice(0, 50);
    return members.filter((m) => `${m.fullName} ${m.email}`.toLowerCase().includes(q)).slice(0, 50);
  }, [members, sendSearch]);

  return (
    <div>
      <PageHeader
        title="Client Comms"
        description="Direct messages and studio-wide announcements."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="inbox" className="gap-1">
            Inbox
            {unreadCount > 0 && (
              <span className="ml-1 rounded-full bg-[#a3b693] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {unreadCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="send">Send message</TabsTrigger>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-0">
          <div className="mb-4 max-w-md">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={inboxQuery}
                onChange={(e) => setInboxQuery(e.target.value)}
                placeholder="Search inbox…"
                className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card">
            {loading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : inboxRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Inbox className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground">Inbox is empty.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {inboxRows.map((m) => (
                  <li
                    key={m.id}
                    className={cn(
                      "cursor-pointer px-5 py-3 hover:bg-muted/30",
                      !m.is_read && "bg-[#e8efe3]/40",
                    )}
                    onClick={() => void markRead(m.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          <span
                            className={cn(
                              "font-semibold",
                              !m.is_read && "text-[#3d4f36]",
                            )}
                          >
                            {m.fromName}
                          </span>
                          {m.subject && (
                            <span className="ml-2 text-muted-foreground">· {m.subject}</span>
                          )}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                          {m.body}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(m.created_at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!loading && inbox.length > 0 && (
            <PaginationFooter
              page={inboxPage}
              pageCount={inboxPageCount}
              total={inbox.length}
              onPrev={() => setInboxPage((p) => Math.max(1, p - 1))}
              onNext={() => setInboxPage((p) => Math.min(inboxPageCount, p + 1))}
            />
          )}
        </TabsContent>

        <TabsContent value="send" className="mt-0">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5">
              <Label className="mb-1.5 block">Recipient</Label>
              <Input
                value={sendSearch}
                onChange={(e) => setSendSearch(e.target.value)}
                placeholder="Search by name or email…"
              />
              <ul className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-border bg-background text-sm">
                {filteredMembers.length === 0 ? (
                  <li className="px-3 py-2 text-muted-foreground">No matches</li>
                ) : (
                  filteredMembers.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => setSendToId(m.id)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40",
                          sendToId === m.id && "bg-[#e8efe3]/60 font-semibold",
                        )}
                      >
                        <span className="truncate">{m.fullName}</span>
                        <span className="ml-2 truncate text-xs text-muted-foreground">
                          {m.email}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="grid gap-1.5">
                <Label htmlFor="msg-subject">Subject</Label>
                <Input
                  id="msg-subject"
                  value={sendSubject}
                  onChange={(e) => setSendSubject(e.target.value)}
                />
              </div>
              <div className="mt-3 grid gap-1.5">
                <Label htmlFor="msg-body">Message</Label>
                <Textarea
                  id="msg-body"
                  rows={8}
                  value={sendBody}
                  onChange={(e) => setSendBody(e.target.value)}
                />
              </div>
              <Button
                type="button"
                onClick={() => void sendDirect()}
                disabled={sending || !sendToId}
                className="mt-4 gap-2 bg-[#a3b693] text-white hover:bg-[#8fa67d]"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send message
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="announcements" className="mt-0">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-display text-lg font-semibold">New announcement</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Sent to every active customer. Generates an in-app notification.
              </p>
              <div className="mt-4 grid gap-1.5">
                <Label htmlFor="ann-subject">Subject</Label>
                <Input
                  id="ann-subject"
                  value={annSubject}
                  onChange={(e) => setAnnSubject(e.target.value)}
                />
              </div>
              <div className="mt-3 grid gap-1.5">
                <Label htmlFor="ann-body">Body</Label>
                <Textarea
                  id="ann-body"
                  rows={8}
                  value={annBody}
                  onChange={(e) => setAnnBody(e.target.value)}
                />
              </div>
              <Button
                type="button"
                onClick={() => void sendAnnouncement()}
                disabled={annSending}
                className="mt-4 gap-2 bg-[#a3b693] text-white hover:bg-[#8fa67d]"
              >
                {annSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Megaphone className="h-4 w-4" />
                )}
                Broadcast to all members
              </Button>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-display text-lg font-semibold">Recent announcements</h3>
              {loading ? (
                <div className="mt-3 space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : announcements.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  No announcements sent yet.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {announcements.slice(0, 6).map((m) => (
                    <li key={m.id} className="rounded-lg border border-border p-3">
                      <p className="text-sm font-semibold">{m.subject || "Announcement"}</p>
                      <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{m.body}</p>
                      <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {formatDate(m.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sent" className="mt-0">
          <div className="mb-4 max-w-md">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={sentQuery}
                onChange={(e) => setSentQuery(e.target.value)}
                placeholder="Search sent…"
                className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card">
            {loading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : sentRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Send className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground">No messages sent yet.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {sentRows.map((m) => (
                  <li key={m.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          <span className="font-semibold">To: {m.toName}</span>
                          {m.subject && (
                            <span className="ml-2 text-muted-foreground">· {m.subject}</span>
                          )}
                          {m.message_type === "announcement" && (
                            <span className="ml-2 rounded-full bg-[#e8efe3] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#3d4f36]">
                              Announcement
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                          {m.body}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(m.created_at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {!loading && sent.length > 0 && (
            <PaginationFooter
              page={sentPage}
              pageCount={sentPageCount}
              total={sent.length}
              onPrev={() => setSentPage((p) => Math.max(1, p - 1))}
              onNext={() => setSentPage((p) => Math.min(sentPageCount, p + 1))}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PaginationFooter({
  page,
  pageCount,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>
        Page {page} of {pageCount} · {total} total
      </span>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onPrev} disabled={page <= 1}>
          <ChevronLeft className="h-4 w-4" /> Prev
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={page >= pageCount}
        >
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
