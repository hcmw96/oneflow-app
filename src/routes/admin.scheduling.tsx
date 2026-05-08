import { createFileRoute, redirect } from "@tanstack/react-router";

// Scheduling and Classes were merged into a single screen — this route
// just forwards to the unified page so old links keep working.
export const Route = createFileRoute("/admin/scheduling")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/classes" });
  },
});
