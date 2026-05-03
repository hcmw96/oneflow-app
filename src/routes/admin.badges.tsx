import { createFileRoute } from "@tanstack/react-router";
import { AdminComingSoon } from "@/components/admin/AdminComingSoon";

export const Route = createFileRoute("/admin/badges")({
  component: () => <AdminComingSoon title="Badges" />,
});
