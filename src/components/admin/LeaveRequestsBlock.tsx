import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarOff, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/lib/supabaseErrors";
import { formatStudioDateTime } from "@/lib/timezone";
import { cn } from "@/lib/utils";

export const LEAVE_TYPES = [
  { value: "annual_leave", label: "Annual Leave" },
  { value: "sick_leave", label: "Sick Leave" },
  { value: "family_responsibility", label: "Family Responsibility" },
  { value: "off_day", label: "Off Day" },
  { value: "other", label: "Other" },
] as const;

export type LeaveTypeValue = (typeof LEAVE_TYPES)[number]["value"];

export function leaveTypeLabel(v: string): string {
  return LEAVE_TYPES.find((t) => t.value === v)?.label ?? v.replace(/_/g, " ");
}

function fullName(p: { first_name?: string | null; last_name?: string | null } | null): string {
  if (!p) return "—";
  return [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "—";
}

const DEEDS_EMAIL = "deeds@oneflow.co.za";

type StaffProfile = { first_name: string | null; last_name: string | null; email: string | null };

type LeaveRow = {
  id: string;
  profile_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  notes: string | null;
  sick_note_url: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  staff_profile: StaffProfile | null;
  reviewer_profile: StaffProfile | null;
};

function oneProf(p: LeaveRow["staff_profile"]): StaffProfile | null {
  return p ?? null;
}

/** Staff: request leave form (sheet). */
export function StaffLeaveRequestSection({
  profileId,
  staffProfile,
}: {
  profileId: string;
  staffProfile: StaffProfile | null;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveTypeValue>("annual_leave");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setLeaveType("annual_leave");
    setNotes("");
    setFile(null);
    const t = new Date();
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, "0");
    const d = String(t.getDate()).padStart(2, "0");
    const iso = `${y}-${m}-${d}`;
    setStartDate(iso);
    setEndDate(iso);
  }, [open]);

  const showSickUpload = leaveType === "sick_leave";

  const submit = async () => {
    if (!startDate || !endDate) {
      toast.error("Choose start and end dates.");
      return;
    }
    if (endDate < startDate) {
      toast.error("End date must be on or after start date.");
      return;
    }
    if (showSickUpload && !file) {
      toast.error("Please attach a sick note (image or PDF).");
      return;
    }

    setSaving(true);
    try {
      let sickPath: string | null = null;
      let sickLinkForEmail = "Not provided";

      if (showSickUpload && file) {
        const ext = (file.name.split(".").pop() || "pdf").toLowerCase().slice(0, 8);
        const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : "pdf";
        sickPath = `${profileId}/${startDate}-sick-note.${safeExt}`;
        const { error: upErr } = await supabase.storage.from("leave-documents").upload(sickPath, file, {
          upsert: true,
          contentType: file.type || undefined,
        });
        if (upErr) {
          console.error(upErr);
          toast.error(supabaseErrorMessage(upErr, "Could not upload sick note"));
          setSaving(false);
          return;
        }
        const { data: signed } = await supabase.storage
          .from("leave-documents")
          .createSignedUrl(sickPath, 60 * 60 * 24 * 7);
        if (signed?.signedUrl) sickLinkForEmail = signed.signedUrl;
      }

      const { data: inserted, error: insErr } = await supabase
        .from("leave_requests")
        .insert({
          profile_id: profileId,
          leave_type: leaveType,
          start_date: startDate,
          end_date: endDate,
          notes: notes.trim() || null,
          sick_note_url: sickPath,
          status: "pending",
        })
        .select("id")
        .maybeSingle();

      if (insErr || !inserted) {
        console.error(insErr);
        toast.error(supabaseErrorMessage(insErr, "Could not submit leave request"));
        setSaving(false);
        return;
      }

      const requesterName = fullName(staffProfile);
      const typeLabel = leaveTypeLabel(leaveType);
      const notesLine = notes.trim() || "None";

      const { error: mailErr } = await supabase.functions.invoke("send-email", {
        body: {
          to: DEEDS_EMAIL,
          template: "leave_request",
          data: {
            requester_name: requesterName,
            leave_type_label: typeLabel,
            start_date: startDate,
            end_date: endDate,
            notes: notesLine,
            sick_note: sickLinkForEmail,
          },
        },
      });
      if (mailErr) {
        console.error(mailErr);
        toast.error("Request saved but email to deeds could not be sent.");
      } else {
        toast.success("Leave request submitted.");
      }
      setOpen(false);
    } catch (e) {
      console.error(e);
      toast.error("Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[#c5d4b8]/80 bg-[#f4f7f0]/70 p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-display text-lg font-bold text-[#3d4f36]">Leave requests</h3>
          <p className="text-sm text-muted-foreground">
            Submit time off for management to review.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className="gap-2 bg-[#a3b693] text-white hover:bg-[#8fa67d]"
        >
          <CalendarOff className="h-4 w-4" />
          Request leave
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Request leave</SheetTitle>
          </SheetHeader>
          <div className="mt-6 grid gap-4">
            <div className="grid gap-1.5">
              <Label>Leave type</Label>
              <Select value={leaveType} onValueChange={(v) => setLeaveType(v as LeaveTypeValue)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="lv-start">Start date</Label>
                <Input
                  id="lv-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="lv-end">End date</Label>
                <Input
                  id="lv-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lv-notes">Notes (optional)</Label>
              <Textarea
                id="lv-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any details for management…"
              />
            </div>
            {showSickUpload ? (
              <div className="grid gap-1.5">
                <Label htmlFor="lv-sick">Sick note (image or PDF)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="lv-sick"
                    type="file"
                    accept="image/*,.pdf,application/pdf"
                    className="cursor-pointer"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  {file ? (
                    <span className="text-xs text-muted-foreground truncate">{file.name}</span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  <Upload className="mr-1 inline h-3 w-3" aria-hidden />
                  Uploaded securely to the studio.
                </p>
              </div>
            ) : null}
          </div>
          <SheetFooter className="mt-6 gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={saving}
              className="bg-[#a3b693] text-white hover:bg-[#8fa67d]"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Submit
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </section>
  );
}

/** Management: review leave requests. */
export function AdminLeaveRequestsTab({
  meId,
  reviewerProfile,
}: {
  meId: string;
  reviewerProfile: StaffProfile | null;
}) {
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "declined">(
    "pending",
  );
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [decisionOpen, setDecisionOpen] = useState<LeaveRow | null>(null);
  const [decision, setDecision] = useState<"approved" | "declined" | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: raw, error } = await supabase
      .from("leave_requests")
      .select(
        "id, profile_id, leave_type, start_date, end_date, notes, sick_note_url, status, reviewed_by, reviewed_at, review_note, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error(error);
      toast.error(supabaseErrorMessage(error, "Could not load leave requests"));
      setRows([]);
      setLoading(false);
      return;
    }

    const list = (raw ?? []) as Omit<LeaveRow, "staff_profile" | "reviewer_profile">[];
    const profileIds = [
      ...new Set(
        list.flatMap((r) =>
          [r.profile_id, r.reviewed_by].filter((id): id is string => Boolean(id)),
        ),
      ),
    ];
    let profMap = new Map<string, StaffProfile>();
    if (profileIds.length > 0) {
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", profileIds);
      if (pErr) console.error(pErr);
      for (const p of profs ?? []) {
        const row = p as { id: string; first_name: string | null; last_name: string | null; email: string | null };
        profMap.set(row.id, {
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
        });
      }
    }

    const merged: LeaveRow[] = list.map((r) => ({
      ...r,
      staff_profile: profMap.get(r.profile_id) ?? null,
      reviewer_profile: r.reviewed_by ? profMap.get(r.reviewed_by) ?? null : null,
    }));

    setRows(merged);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const staffOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      const p = oneProf(r.staff_profile);
      const name = fullName(p);
      m.set(r.profile_id, name);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (staffFilter !== "all" && r.profile_id !== staffFilter) return false;
      if (fromDate && r.end_date < fromDate) return false;
      if (toDate && r.start_date > toDate) return false;
      return true;
    });
  }, [rows, statusFilter, staffFilter, fromDate, toDate]);

  const openSickNote = async (path: string) => {
    const { data, error } = await supabase.storage.from("leave-documents").createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      toast.error("Could not open sick note.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const applyDecision = async () => {
    if (!decisionOpen || !decision) return;
    setBusy(true);
    const row = decisionOpen;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("leave_requests")
      .update({
        status: decision,
        reviewed_by: meId,
        reviewed_at: now,
        review_note: reviewNote.trim() || null,
      })
      .eq("id", row.id);

    if (error) {
      console.error(error);
      toast.error(supabaseErrorMessage(error, "Could not update request"));
      setBusy(false);
      return;
    }

    const staff = oneProf(row.staff_profile);
    const toEmail = (staff?.email ?? "").trim();
    const staffName = fullName(staff);
    const typeLabel = leaveTypeLabel(row.leave_type);
    const reviewerName = fullName(reviewerProfile);
    const outcome = decision === "approved" ? "approved" : "declined";
    const reviewNoteHtml = reviewNote.trim();

    if (toEmail) {
      const { error: mailErr } = await supabase.functions.invoke("send-email", {
        body: {
          to: toEmail,
          template: "leave_request_response",
          data: {
            staff_first_name: staff?.first_name?.trim() || staffName.split(/\s+/)[0] || "there",
            leave_type_label: typeLabel,
            start_date: row.start_date,
            end_date: row.end_date,
            outcome,
            reviewer_name: reviewerName,
            review_note: reviewNoteHtml,
          },
        },
      });
      if (mailErr) console.error(mailErr);
    }

    toast.success(`Request ${outcome}.`);
    setDecisionOpen(null);
    setDecision(null);
    setReviewNote("");
    setBusy(false);
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="grid gap-1.5">
          <Label>Status</Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="declined">Declined</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Staff member</Label>
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              {staffOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="lr-from">From (leave start)</Label>
            <Input
              id="lr-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lr-to">To (leave end)</Label>
            <Input id="lr-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No leave requests match your filters.
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => {
            const staff = oneProf(r.staff_profile);
            const rev = r.reviewer_profile;
            return (
              <li
                key={r.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-display text-base font-bold">{fullName(staff)}</p>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{leaveTypeLabel(r.leave_type)}</span>
                      {" · "}
                      {r.start_date} → {r.end_date}
                    </p>
                    {r.notes ? (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">Notes:</span> {r.notes}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Submitted {formatStudioDateTime(r.created_at)}
                    </p>
                    {r.sick_note_url ? (
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 text-[#a3b693]"
                        onClick={() => void openSickNote(r.sick_note_url!)}
                      >
                        View sick note
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">No sick note attached.</p>
                    )}
                    {r.status !== "pending" ? (
                      <p className="text-xs">
                        <span className="font-semibold capitalize">{r.status}</span>
                        {r.reviewed_at
                          ? ` · ${formatStudioDateTime(r.reviewed_at)} by ${fullName(rev)}`
                          : ""}
                        {r.review_note ? ` — ${r.review_note}` : ""}
                      </p>
                    ) : null}
                  </div>
                  {r.status === "pending" ? (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="bg-[#a3b693] text-white hover:bg-[#8fa67d]"
                        onClick={() => {
                          setDecision("approved");
                          setReviewNote("");
                          setDecisionOpen(r);
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-destructive/50 text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setDecision("declined");
                          setReviewNote("");
                          setDecisionOpen(r);
                        }}
                      >
                        Decline
                      </Button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={!!decisionOpen} onOpenChange={(o) => !o && !busy && setDecisionOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {decision === "approved" ? "Approve" : "Decline"} leave request?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Optional note to include in the email to the staff member.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            placeholder="Review note (optional)"
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(decision === "declined" && "bg-destructive hover:bg-destructive/90")}
              onClick={(e) => {
                e.preventDefault();
                void applyDecision();
              }}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
