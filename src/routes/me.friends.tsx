import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/me/friends")({
  beforeLoad: () => {
    throw redirect({ to: "/me", search: { tab: "friends" } });
  },
});
