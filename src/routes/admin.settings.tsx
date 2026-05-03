import { createFileRoute } from "@tanstack/react-router";
import { AdminComingSoon } from "@/components/admin/AdminComingSoon";

export const Route = createFileRoute("/admin/settings")({
  component: () => <AdminComingSoon title="Settings" />,
});
