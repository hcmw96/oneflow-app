import { Link, useLocation } from "@tanstack/react-router";
import { Home, Target, Calendar, Tag, User } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/goals", label: "Goals", icon: Target, exact: false },
  { to: "/schedule", label: "Schedule", icon: Calendar, exact: false },
  { to: "/pricing", label: "Pricing", icon: Tag, exact: false },
  { to: "/me", label: "Me", icon: User, exact: false },
] as const;

export function BottomNav() {
  const loc = useLocation();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2 py-2">
        {tabs.map(({ to, label, icon: Icon, exact }) => {
          const active = exact ? loc.pathname === to : loc.pathname.startsWith(to);
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                className={cn(
                  "flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 text-[11px] font-medium transition-colors duration-200 ease-out",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
