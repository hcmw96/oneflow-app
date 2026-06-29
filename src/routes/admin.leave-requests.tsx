import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/PageHeader";
import {
  AdminLeaveRequestsTab,
  StaffLeaveRequestSection,
} from "@/components/admin/LeaveRequestsBlock";
import { getUser, supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/leave-requests")({
  head: () => ({ meta: [{ title: "Leave requests — One Flow Admin" }] }),
  component: LeaveRequestsPage,
});

type StaffRole = "director" | "management" | "clock_staff" | "other";

function classifyRole(role: string | null | undefined): StaffRole {
  const r = (role ?? "").toLowerCase();
  if (r === "director") return "director";
  if (r === "management") return "management";
  if (r === "guide" || r === "front_desk" || r === "boh") return "clock_staff";
  return "other";
}

function LeaveRequestsPage() {
  const [me, setMe] = useState<string | null>(null);
  const [role, setRole] = useState<StaffRole>("other");
  const [myProfile, setMyProfile] = useState<{
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      const user = await getUser();
      if (!user) return;
      setMe(user.id);
      const { data } = await supabase
        .from("profiles")
        .select("role, first_name, last_name, email")
        .eq("id", user.id)
        .maybeSingle();
      setRole(classifyRole((data as { role?: string } | null)?.role));
      setMyProfile({
        first_name: (data as { first_name?: string | null } | null)?.first_name ?? null,
        last_name: (data as { last_name?: string | null } | null)?.last_name ?? null,
        email: (data as { email?: string | null } | null)?.email ?? null,
      });
    })();
  }, []);

  const isAdmin = role === "director" || role === "management";
  const canAccess = role !== "other";

  if (!canAccess) {
    return (
      <div>
        <PageHeader title="Leave requests" />
        <p className="text-sm text-muted-foreground">You don&apos;t have access to leave requests.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Leave requests"
        description={
          isAdmin
            ? "Review staff leave and submit your own requests."
            : "Submit and track your leave requests."
        }
      />

      {me && myProfile ? (
        <div className="mb-6">
          <StaffLeaveRequestSection profileId={me} staffProfile={myProfile} />
        </div>
      ) : null}

      {isAdmin && me && myProfile ? (
        <AdminLeaveRequestsTab meId={me} reviewerProfile={myProfile} />
      ) : null}
    </div>
  );
}
