import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

/** Deep links open the customers list with the profile slide-over. */
export const Route = createFileRoute("/admin/customers/$customerId")({
  head: () => ({
    meta: [{ title: "Customer — One Flow Admin" }],
  }),
  component: CustomerIdRedirect,
});

function CustomerIdRedirect() {
  const { customerId } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({
      to: "/admin/customers",
      search: { profile: customerId },
      replace: true,
    });
  }, [customerId, navigate]);

  return (
    <div className="p-8 text-center text-sm text-muted-foreground">Opening customer profile…</div>
  );
}
