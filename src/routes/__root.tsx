import { useEffect } from "react";
import { Outlet, Link, createRootRoute, HeadContent, useRouterState } from "@tanstack/react-router";
import { BottomNav } from "@/components/BottomNav";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/contexts/auth";
import { captureReferrerFromSearch } from "@/lib/referral";

function CustomerBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hide =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/auth") ||
    pathname === "/onboarding";
  if (hide) return null;
  return <BottomNav />;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "One Flow" },
      {
        name: "description",
        content: "Book classes, track Flow Points, and manage your One Flow journey.",
      },
      { name: "author", content: "One Flow" },
      { name: "theme-color", content: "#a3b693" },
      { property: "og:title", content: "One Flow" },
      {
        property: "og:description",
        content: "Book classes, track Flow Points, and manage your One Flow journey.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function isAuthPublicPath(pathname: string) {
  return pathname.startsWith("/auth") || pathname === "/faq";
}

function ReferralCapture() {
  const search = useRouterState({ select: (s) => s.location.search });
  useEffect(() => {
    captureReferrerFromSearch(search ?? "");
  }, [search]);
  return null;
}

function ProtectedOutlet() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, authReady, profile, profileReady } = useAuth();

  useEffect(() => {
    if (!authReady) return;
    const publicPath = isAuthPublicPath(pathname);

    if (!user) {
      if (!publicPath) window.location.assign("/auth");
      return;
    }

    if (!profileReady) return;

    const role = (profile?.role ?? "").toLowerCase();
    const isStaff = role === "director" || role === "management" || role === "guide";
    const onboardingDone = profile?.onboarding_complete === true;
    const onOnboarding = pathname === "/onboarding";
    const onAdmin = pathname.startsWith("/admin");
    const onAuth = pathname.startsWith("/auth");

    if (!onboardingDone) {
      if (!onOnboarding) window.location.assign("/onboarding");
      return;
    }

    if (onOnboarding || onAuth) {
      window.location.assign(isStaff ? "/admin" : "/");
      return;
    }

    if (isStaff && !onAdmin) {
      window.location.assign("/admin");
      return;
    }

    if (!isStaff && onAdmin) {
      window.location.assign("/");
    }
  }, [authReady, user, profile, profileReady, pathname]);

  return <Outlet />;
}

function RootComponent() {
  return (
    <>
      <HeadContent />
      <AuthProvider>
        <ReferralCapture />
        <ProtectedOutlet />
        <CustomerBottomNav />
      </AuthProvider>
      <Toaster position="top-center" />
    </>
  );
}
