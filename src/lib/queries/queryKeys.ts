/** Central React Query keys — keep stable for cache sharing across routes. */
export const queryKeys = {
  authProfile: (userId: string | null | undefined) =>
    ["auth-profile", userId ?? "anon"] as const,
  memberBookings: (userId: string) => ["member-bookings", userId] as const,
  memberWaitlist: (userId: string) => ["member-waitlist", userId] as const,
  homePage: (userId: string) => ["home-page", userId] as const,
  scheduleDay: (dateKey: string) => ["schedule-day", dateKey] as const,
  adminDashboard: () => ["admin-dashboard"] as const,
  bookingSheet: (userId: string, classId: string) =>
    ["booking-sheet", userId, classId] as const,
  bookableCatalog: () => ["bookable-product-catalog"] as const,
  memberBadges: (userId: string) => ["member-badges", userId] as const,
};
