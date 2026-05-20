import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy “Scheduling” path forwards to Schedule (calendar sessions screen).
export const Route = createFileRoute("/admin/scheduling")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/schedule" });
  },
});
