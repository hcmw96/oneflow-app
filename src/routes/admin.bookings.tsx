import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout for /admin/bookings and /admin/bookings/$classId.
 * The day list lives on the index route; without this Outlet the child URL
 * updates and the roster never mounts.
 */
export const Route = createFileRoute("/admin/bookings")({
  component: BookingsLayout,
});

function BookingsLayout() {
  return <Outlet />;
}
