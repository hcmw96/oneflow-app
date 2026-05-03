import { createFileRoute } from "@tanstack/react-router";
import { AdminComingSoon } from "@/components/admin/AdminComingSoon";

export const Route = createFileRoute("/admin/client-comms")({
  component: () => <AdminComingSoon title="Client Comms" />,
});
