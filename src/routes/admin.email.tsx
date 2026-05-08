import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  ChevronLeft,
  ChevronRight,
  Eye,
  Italic,
  Link as LinkIcon,
  Loader2,
  Mail,
  Save,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getUser, supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/email")({
  head: () => ({ meta: [{ title: "Email Marketing — One Flow Admin" }] }),
  component: EmailPage,
});

const TZ = "Africa/Johannesburg";
const PAGE_SIZE = 20;

type CampaignRow = {
  id: string;
  subject: string;
  body_html: string;
  recipient_filter: Record<string, unknown>;
  sent_at: string | null;
  sent_count: number;
  status: "draft" | "sent";
  created_at: string;
};

type RecipientFilter = "all" | "active" | "with_credits" | "role";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-ZA", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function previewWrap(subject: string, html: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f5f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#a3b693;padding:28px;text-align:center;color:#fff;font-weight:700;">One Flow</td></tr>
      <tr><td style="padding:32px;color:#2d2d2d;">
        <h2 style="font-size:20px;color:#a3b693;margin:0 0 16px;">${subject || ""}</h2>
        ${html}
      </td></tr>
      <tr><td style="padding:20px;background:#f5f5f0;text-align:center;color:#888;font-size:12px;">One Flow Wellness Studio · Cape Town</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function EmailPage() {
  const [tab, setTab] = useState<string>("campaigns");
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);

  // List paging
  const [page, setPage] = useState(1);

  // Composer state
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [recipientType, setRecipientType] = useState<RecipientFilter>("all");
  const [roleValue, setRoleValue] = useState("customer");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);

  // Detail dialog
  const [detail, setDetail] = useState<CampaignRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_campaigns")
      .select("id, subject, body_html, recipient_filter, sent_at, sent_count, status, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      console.error(error);
      toast.error(error.message || "Could not load campaigns");
      setLoading(false);
      return;
    }
    setCampaigns((data ?? []) as CampaignRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(campaigns.length / PAGE_SIZE));
  const pageRows = campaigns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exec = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    if (editorRef.current) setBodyHtml(editorRef.current.innerHTML);
  };

  const insertLink = () => {
    const url = prompt("URL");
    if (!url) return;
    exec("createLink", url);
  };

  const queryRecipients = useCallback(async (): Promise<string[]> => {
    if (recipientType === "all") {
      const { data, error } = await supabase
        .from("profiles")
        .select("email")
        .eq("role", "customer");
      if (error) throw error;
      return (data ?? []).map((r: { email: string | null }) => r.email ?? "").filter(Boolean);
    }
    if (recipientType === "with_credits") {
      const { data, error } = await supabase
        .from("user_credits")
        .select("profiles(email)")
        .gt("credits_remaining", 0);
      if (error) throw error;
      const emails = new Set<string>();
      for (const r of (data ?? []) as Record<string, unknown>[]) {
        const p = (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) as
          | { email?: string | null }
          | null;
        if (p?.email) emails.add(p.email);
      }
      return [...emails];
    }
    if (recipientType === "active") {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from("bookings")
        .select("profiles(email)")
        .gte("created_at", since.toISOString());
      if (error) throw error;
      const emails = new Set<string>();
      for (const r of (data ?? []) as Record<string, unknown>[]) {
        const p = (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) as
          | { email?: string | null }
          | null;
        if (p?.email) emails.add(p.email);
      }
      return [...emails];
    }
    if (recipientType === "role") {
      const { data, error } = await supabase
        .from("profiles")
        .select("email")
        .eq("role", roleValue);
      if (error) throw error;
      return (data ?? []).map((r: { email: string | null }) => r.email ?? "").filter(Boolean);
    }
    return [];
  }, [recipientType, roleValue]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await queryRecipients();
        if (!cancelled) setRecipientCount(list.length);
      } catch {
        if (!cancelled) setRecipientCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryRecipients]);

  const newCampaign = () => {
    setSubject("");
    setBodyHtml("");
    setRecipientType("all");
    setRoleValue("customer");
    setDraftId(null);
    if (editorRef.current) editorRef.current.innerHTML = "";
    setTab("compose");
  };

  const saveDraft = async () => {
    if (!subject.trim() && !bodyHtml.trim()) {
      toast.error("Add a subject or body before saving");
      return;
    }
    setSavingDraft(true);
    const user = await getUser();
    const payload = {
      subject: subject.trim() || "(no subject)",
      body_html: bodyHtml,
      recipient_filter: { type: recipientType, role: roleValue },
      status: "draft" as const,
      created_by: user?.id ?? null,
    };
    if (draftId) {
      const { error } = await supabase.from("email_campaigns").update(payload).eq("id", draftId);
      setSavingDraft(false);
      if (error) {
        toast.error(error.message);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("email_campaigns")
        .insert(payload)
        .select("id")
        .maybeSingle();
      setSavingDraft(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      setDraftId((data as { id?: string } | null)?.id ?? null);
    }
    toast.success("Draft saved");
    await load();
  };

  const send = async () => {
    setSending(true);
    let recipients: string[] = [];
    try {
      recipients = await queryRecipients();
    } catch (e: unknown) {
      setSending(false);
      toast.error(e instanceof Error ? e.message : "Could not load recipients");
      return;
    }
    if (recipients.length === 0) {
      setSending(false);
      toast.error("No recipients matched this filter");
      return;
    }

    let success = 0;
    let failed = 0;
    for (const email of recipients) {
      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          to: email,
          template: "marketing",
          data: { subject: subject.trim() || "An update from One Flow", body_html: bodyHtml },
        },
      });
      if (error) failed += 1;
      else success += 1;
    }

    const user = await getUser();
    const payload = {
      subject: subject.trim() || "(no subject)",
      body_html: bodyHtml,
      recipient_filter: { type: recipientType, role: roleValue },
      sent_at: new Date().toISOString(),
      sent_count: success,
      status: "sent" as const,
      created_by: user?.id ?? null,
    };
    if (draftId) {
      await supabase.from("email_campaigns").update(payload).eq("id", draftId);
    } else {
      await supabase.from("email_campaigns").insert(payload);
    }

    setSending(false);
    setConfirmSendOpen(false);
    if (failed === 0) toast.success(`Sent ${success} email${success === 1 ? "" : "s"}`);
    else toast.warning(`${success} sent, ${failed} failed`);
    setSubject("");
    setBodyHtml("");
    setDraftId(null);
    if (editorRef.current) editorRef.current.innerHTML = "";
    await load();
    setTab("campaigns");
  };

  const recipientLabel = useMemo(() => {
    switch (recipientType) {
      case "all":
        return "All members";
      case "active":
        return "Active members (booked in last 30 days)";
      case "with_credits":
        return "Members with credits";
      case "role":
        return `Role: ${roleValue}`;
    }
  }, [recipientType, roleValue]);

  const openCampaign = (c: CampaignRow) => setDetail(c);

  return (
    <div>
      <PageHeader
        title="Email Marketing"
        description={loading ? "Loading…" : `${campaigns.length} campaigns`}
        actions={
          <Button
            type="button"
            onClick={newCampaign}
            className="gap-2 bg-[#a3b693] text-white hover:bg-[#8fa67d]"
          >
            <Mail className="h-4 w-4" /> New campaign
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="compose">New campaign</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="mt-0">
          <div className="min-w-0 overflow-x-auto rounded-2xl border border-border bg-card">
            {loading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : campaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Mail className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground">No campaigns yet.</p>
              </div>
            ) : (
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Subject</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Sent count</th>
                    <th className="px-5 py-3 font-medium">Sent at</th>
                    <th className="px-5 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((c) => (
                    <tr
                      key={c.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => openCampaign(c)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openCampaign(c);
                        }
                      }}
                      className="cursor-pointer border-t border-border hover:bg-muted/30"
                    >
                      <td className="max-w-[260px] truncate px-5 py-3 font-semibold">
                        {c.subject}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            c.status === "sent"
                              ? "bg-green-100 text-green-800"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 tabular-nums text-muted-foreground">
                        {c.sent_count}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                        {formatDate(c.sent_at)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                        {formatDate(c.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {!loading && campaigns.length > 0 && (
            <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                Page {page} of {pageCount} · {campaigns.length} total
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page >= pageCount}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="compose" className="mt-0">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="grid gap-1.5">
                <Label htmlFor="ec-subject">Subject</Label>
                <Input
                  id="ec-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>

              <div className="mt-3 grid gap-1.5">
                <Label>Body</Label>
                <div className="rounded-lg border border-border bg-background">
                  <div className="flex items-center gap-1 border-b border-border px-2 py-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => exec("bold")}
                      aria-label="Bold"
                    >
                      <Bold className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => exec("italic")}
                      aria-label="Italic"
                    >
                      <Italic className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={insertLink}
                      aria-label="Insert link"
                    >
                      <LinkIcon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div
                    ref={editorRef}
                    contentEditable
                    role="textbox"
                    aria-multiline="true"
                    className="min-h-[220px] px-3 py-3 text-sm outline-none"
                    onInput={(e) => setBodyHtml((e.target as HTMLDivElement).innerHTML)}
                    suppressContentEditableWarning
                  />
                </div>
              </div>

              <div className="mt-3 grid gap-1.5">
                <Label>Recipients</Label>
                <Select
                  value={recipientType}
                  onValueChange={(v) => setRecipientType(v as RecipientFilter)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All members</SelectItem>
                    <SelectItem value="active">Active members (booked in last 30 days)</SelectItem>
                    <SelectItem value="with_credits">Members with credits</SelectItem>
                    <SelectItem value="role">Specific role</SelectItem>
                  </SelectContent>
                </Select>
                {recipientType === "role" && (
                  <Input
                    value={roleValue}
                    onChange={(e) => setRoleValue(e.target.value)}
                    placeholder="customer"
                    className="mt-2"
                  />
                )}
                {recipientCount != null && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {recipientCount} recipient{recipientCount === 1 ? "" : "s"} matched.
                  </p>
                )}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => setPreviewOpen(true)}
                  disabled={!subject.trim() && !bodyHtml.trim()}
                >
                  <Eye className="h-4 w-4" /> Preview
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => void saveDraft()}
                  disabled={savingDraft}
                >
                  {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save draft
                </Button>
                <Button
                  type="button"
                  className="gap-2 bg-[#a3b693] text-white hover:bg-[#8fa67d]"
                  onClick={() => setConfirmSendOpen(true)}
                  disabled={sending || !subject.trim()}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send campaign
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-display text-lg font-semibold">Preview</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Recipients: {recipientLabel}
              </p>
              <div className="mt-4 overflow-hidden rounded-xl border border-border">
                <iframe
                  title="Email preview"
                  className="h-[480px] w-full bg-white"
                  srcDoc={previewWrap(subject, bodyHtml)}
                />
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detail?.subject ?? "Campaign"}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>Status: {detail.status}</span>
                <span>Sent: {detail.sent_count}</span>
                <span>Sent at: {formatDate(detail.sent_at)}</span>
                <span>Created: {formatDate(detail.created_at)}</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-border">
                <iframe
                  title="Campaign preview"
                  className="h-[420px] w-full bg-white"
                  srcDoc={previewWrap(detail.subject, detail.body_html)}
                />
              </div>
              {detail.status === "sent" && (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setSubject(detail.subject);
                    setBodyHtml(detail.body_html);
                    if (editorRef.current) editorRef.current.innerHTML = detail.body_html;
                    setDraftId(null);
                    const filter = (detail.recipient_filter ?? {}) as Record<string, unknown>;
                    setRecipientType((filter.type as RecipientFilter) ?? "all");
                    if (filter.role) setRoleValue(String(filter.role));
                    setDetail(null);
                    setTab("compose");
                  }}
                >
                  <Send className="h-4 w-4" /> Resend
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preview — {subject || "(no subject)"}</DialogTitle>
          </DialogHeader>
          <div className="overflow-hidden rounded-xl border border-border">
            <iframe
              title="Preview"
              className="h-[520px] w-full bg-white"
              srcDoc={previewWrap(subject, bodyHtml)}
            />
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This will send to {recipientCount ?? "?"} recipient
              {recipientCount === 1 ? "" : "s"} ({recipientLabel}). This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void send();
              }}
              disabled={sending}
              className="bg-[#a3b693] text-white hover:bg-[#8fa67d]"
            >
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
