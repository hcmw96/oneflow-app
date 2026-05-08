import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutGrid,
  QrCode,
  CalendarDays,
  BookOpen,
  Users,
  Package,
  UserCog,
  CalendarClock,
  Clock,
  GraduationCap,
  DollarSign,
  Receipt,
  FileText,
  Trophy,
  Megaphone,
  Mail,
  MessageCircle,
  Send,
  Settings,
  Download,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdminNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** Routes guides may open (nav + deep-link guard in `admin.tsx`). */
export const GUIDE_ALLOWED_ADMIN_ROUTES = [
  "/admin/check-in",
  "/admin/bookings",
  "/admin/classes",
  "/admin/scheduling",
] as const;

export function isGuideRole(role: string | null | undefined) {
  return (role ?? "").toLowerCase() === "guide";
}

export function isPathAllowedForGuide(pathname: string) {
  return GUIDE_ALLOWED_ADMIN_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function navItemsForRole(role: string | null | undefined): AdminNavItem[] {
  const r = (role ?? "").toLowerCase();
  if (r === "director" || r === "management") return adminNavItems;
  if (isGuideRole(role)) {
    const allow = new Set<string>(GUIDE_ALLOWED_ADMIN_ROUTES);
    return adminNavItems
      .filter((i) => allow.has(i.to))
      .map((i) => (i.to === "/admin/scheduling" ? { ...i, label: "Schedule" } : i));
  }
  return adminNavItems;
}

export const adminNavItems: AdminNavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutGrid },
  { to: "/admin/check-in", label: "Check-In", icon: QrCode },
  { to: "/admin/classes", label: "Classes", icon: CalendarDays },
  { to: "/admin/bookings", label: "Bookings", icon: BookOpen },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/staff", label: "Staff", icon: UserCog },
  { to: "/admin/scheduling", label: "Scheduling", icon: CalendarClock },
  { to: "/admin/timesheets", label: "Timesheets", icon: Clock },
  { to: "/admin/guides", label: "Guides", icon: GraduationCap },
  { to: "/admin/payouts", label: "Payouts", icon: DollarSign },
  { to: "/admin/transactions", label: "Transactions", icon: Receipt },
  { to: "/admin/waivers", label: "Waivers", icon: FileText },
  { to: "/admin/badges", label: "Badges", icon: Trophy },
  { to: "/admin/promotions", label: "Promotions", icon: Megaphone },
  { to: "/admin/email", label: "Email", icon: Mail },
  { to: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { to: "/admin/client-comms", label: "Client Comms", icon: Send },
  { to: "/admin/settings", label: "Settings", icon: Settings },
  { to: "/admin/install-app", label: "Install App", icon: Download },
];

export function AdminNav({
  collapsed,
  onNavigate,
  role,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  role?: string | null;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = navItemsForRole(role);

  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3">
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active =
            item.to === "/admin"
              ? pathname === "/admin"
              : pathname === item.to || pathname.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/40",
                  collapsed && "justify-center px-2",
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.2 : 1.8} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
