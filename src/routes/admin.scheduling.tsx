import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy “Scheduling” path forwards to Master (week schedule screen).
export const Route = createFileRoute("/admin/scheduling")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/schedule" });
  },
});
