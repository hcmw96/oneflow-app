import { createFileRoute, redirect } from "@tanstack/react-router";

/** Passes are sold from the live pricing page (Supabase products + Yoco). */
export const Route = createFileRoute("/packages")({
  beforeLoad: () => {
    throw redirect({ to: "/pricing" });
  },
});
