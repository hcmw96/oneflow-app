// Mock data for the admin dashboard. Replace with real backend later.

export interface AdminMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  plan: string;
  credits: number;
  lastVisit: string;
  status: "active" | "paused" | "trial";
}

export interface AdminTransaction {
  id: string;
  date: string;
  member: string;
  type: "purchase" | "refund" | "payout";
  description: string;
  amount: number; // in cents (R)
  method: "Card" | "EFT" | "Cash";
  status: "paid" | "pending" | "failed";
}

export interface AdminProduct {
  id: string;
  name: string;
  category: "Add-on" | "Apparel" | "Drink";
  priceCents: number;
  stock: number;
  active: boolean;
}

export interface AdminStaff {
  id: string;
  name: string;
  role: "Director" | "Guide" | "Front Desk" | "Therapist";
  email: string;
  status: "active" | "invited" | "inactive";
}

import type { AllowedClassTypeSlug } from "@/lib/allowedClassTypes";

export interface AdminClassRow {
  id: string;
  name: string;
  type: AllowedClassTypeSlug;
  durationMin: number;
  capacity: number;
  defaultGuide: string;
}

export interface AdminBookingRow {
  id: string;
  member: string;
  className: string;
  startsAt: string;
  status: "booked" | "attended" | "cancelled" | "no-show";
  credit: string;
}

export interface AdminPromo {
  id: string;
  code: string;
  discount: string;
  validFrom: string;
  validTo: string;
  uses: number;
  limit: number;
  status: "active" | "scheduled" | "expired";
}

export interface AdminBadge {
  id: string;
  name: string;
  criteria: string;
  earned: number;
  emoji: string;
}

export interface AdminWaiver {
  id: string;
  version: string;
  publishedAt: string;
  signed: number;
  required: boolean;
}

export interface AdminPayout {
  id: string;
  guide: string;
  period: string;
  hours: number;
  classes: number;
  amountCents: number;
  status: "pending" | "paid";
}

export interface AdminTimesheet {
  id: string;
  staff: string;
  role: string;
  hours: number;
  overtime: number;
  rateCents: number;
}

export interface AdminCommLog {
  id: string;
  member: string;
  channel: "Email" | "WhatsApp" | "SMS" | "Push";
  subject: string;
  sentAt: string;
  status: "delivered" | "opened" | "failed";
}

export interface AdminEmailHistory {
  id: string;
  subject: string;
  audience: string;
  recipients: number;
  sentAt: string;
  openRate: number;
}

export const adminUser = {
  name: "Amber Rose",
  email: "amber.rose2145@gmail.com",
  role: "Director",
};

export const studio = {
  totalRecipientsWithPhone: 8068,
  activeMembers: 1342,
  todaysBookings: 187,
  revenueMTDCents: 38245000,
  checkInsToday: 96,
  capacityUtilisation: 78,
};

export const members: AdminMember[] = [
  { id: "m1", name: "Brooke Wilson", email: "brooke@example.com", phone: "+27 82 555 0101", plan: "All Access", credits: 999, lastVisit: "Today", status: "active" },
  { id: "m2", name: "Thandi Mokoena", email: "thandi@example.com", phone: "+27 83 555 0144", plan: "12 Class Pack", credits: 7, lastVisit: "Yesterday", status: "active" },
  { id: "m3", name: "Liam Pretorius", email: "liam@example.com", phone: "+27 71 555 0192", plan: "Wellzone Unlimited", credits: 999, lastVisit: "2 days ago", status: "active" },
  { id: "m4", name: "Asha Naidoo", email: "asha@example.com", phone: "+27 84 555 0220", plan: "Trial", credits: 1, lastVisit: "5 days ago", status: "trial" },
  { id: "m5", name: "Kerry van Wyk", email: "kerry@example.com", phone: "+27 82 555 0277", plan: "6 Class Pack", credits: 0, lastVisit: "3 weeks ago", status: "paused" },
  { id: "m6", name: "Mika Sato", email: "mika@example.com", phone: "+27 76 555 0301", plan: "Sage", credits: 999, lastVisit: "Today", status: "active" },
  { id: "m7", name: "Tendai Moyo", email: "tendai@example.com", phone: "+27 78 555 0388", plan: "Double Flow", credits: 12, lastVisit: "Today", status: "active" },
];

export const transactions: AdminTransaction[] = [
  { id: "t1", date: "2026-05-02", member: "Brooke Wilson", type: "purchase", description: "All Access — May", amount: 395000, method: "Card", status: "paid" },
  { id: "t2", date: "2026-05-02", member: "Thandi Mokoena", type: "purchase", description: "Mat add-on", amount: 3500, method: "Card", status: "paid" },
  { id: "t3", date: "2026-05-01", member: "Liam Pretorius", type: "purchase", description: "Wellzone Unlimited", amount: 120000, method: "EFT", status: "paid" },
  { id: "t4", date: "2026-05-01", member: "Asha Naidoo", type: "refund", description: "6 Class Pack refund", amount: -90000, method: "Card", status: "paid" },
  { id: "t5", date: "2026-04-30", member: "Mika Sato", type: "purchase", description: "Sage — May", amount: 295000, method: "Card", status: "paid" },
  { id: "t6", date: "2026-04-29", member: "Tendai Moyo", type: "purchase", description: "Double Flow", amount: 240000, method: "Card", status: "pending" },
];

export const products: AdminProduct[] = [
  { id: "p1", name: "Yoga Mat", category: "Add-on", priceCents: 3500, stock: 24, active: true },
  { id: "p2", name: "Towel", category: "Add-on", priceCents: 2000, stock: 56, active: true },
  { id: "p3", name: "Filtered Water", category: "Drink", priceCents: 1500, stock: 120, active: true },
  { id: "p4", name: "Protein Shake", category: "Drink", priceCents: 6500, stock: 48, active: true },
  { id: "p5", name: "Coffee", category: "Drink", priceCents: 3500, stock: 200, active: true },
  { id: "p6", name: "One Flow Tee", category: "Apparel", priceCents: 45000, stock: 18, active: true },
  { id: "p7", name: "One Flow Hoodie", category: "Apparel", priceCents: 95000, stock: 9, active: false },
];

export const staff: AdminStaff[] = [
  { id: "s1", name: "Amber Rose", role: "Director", email: "amber.rose2145@gmail.com", status: "active" },
  { id: "s2", name: "Asha Naidoo", role: "Guide", email: "asha@oneflow.london", status: "active" },
  { id: "s3", name: "Liam Pretorius", role: "Guide", email: "liam@oneflow.london", status: "active" },
  { id: "s4", name: "Zinhle Khumalo", role: "Guide", email: "zinhle@oneflow.london", status: "active" },
  { id: "s5", name: "Mika Sato", role: "Therapist", email: "mika@oneflow.london", status: "active" },
  { id: "s6", name: "Sam Reilly", role: "Front Desk", email: "sam@oneflow.london", status: "invited" },
];

export const classRows: AdminClassRow[] = [
  { id: "c1", name: "Sunrise Vinyasa", type: "yoga", durationMin: 60, capacity: 20, defaultGuide: "Asha Naidoo" },
  { id: "c2", name: "Sculpt & Tone", type: "sculpt", durationMin: 50, capacity: 16, defaultGuide: "Liam Pretorius" },
  { id: "c3", name: "Slow Flow", type: "yoga", durationMin: 60, capacity: 20, defaultGuide: "Zinhle Khumalo" },
  { id: "c4", name: "Power Yoga", type: "power", durationMin: 60, capacity: 20, defaultGuide: "Tendai Moyo" },
  { id: "c5", name: "Sauna Journey", type: "sauna_journey", durationMin: 75, capacity: 12, defaultGuide: "Mika Sato" },
  { id: "c6", name: "Wellzone Open", type: "wellzone", durationMin: 90, capacity: 25, defaultGuide: "Mika Sato" },
  { id: "c7", name: "Pilates Flow", type: "pilates", durationMin: 55, capacity: 14, defaultGuide: "Zinhle Khumalo" },
];

export const bookingRows: AdminBookingRow[] = [
  { id: "b1", member: "Brooke Wilson", className: "Sunrise Vinyasa", startsAt: "Today · 06:30", status: "attended", credit: "All Access" },
  { id: "b2", member: "Thandi Mokoena", className: "Sculpt & Tone", startsAt: "Today · 09:00", status: "booked", credit: "12 Pack" },
  { id: "b3", member: "Asha Naidoo", className: "Slow Flow", startsAt: "Today · 17:30", status: "booked", credit: "Trial" },
  { id: "b4", member: "Liam Pretorius", className: "Sauna Journey", startsAt: "Today · 18:30", status: "booked", credit: "Wellzone" },
  { id: "b5", member: "Kerry van Wyk", className: "Sunrise Vinyasa", startsAt: "Yesterday · 06:30", status: "no-show", credit: "6 Pack" },
  { id: "b6", member: "Mika Sato", className: "Power Yoga", startsAt: "Yesterday · 07:00", status: "attended", credit: "Sage" },
  { id: "b7", member: "Tendai Moyo", className: "Wellzone Open", startsAt: "Tomorrow · 18:00", status: "booked", credit: "Double Flow" },
  { id: "b8", member: "Nadia Khan", className: "Sunrise Vinyasa", startsAt: "Today · 06:30", status: "attended", credit: "All Access" },
  { id: "b9", member: "Ravi Pillay", className: "Sunrise Vinyasa", startsAt: "Today · 06:30", status: "booked", credit: "12 Pack" },
  { id: "b10", member: "Sasha Bell", className: "Sculpt & Tone", startsAt: "Today · 09:00", status: "booked", credit: "All Access" },
  { id: "b11", member: "Jordan Cole", className: "Sculpt & Tone", startsAt: "Today · 09:00", status: "cancelled", credit: "6 Pack" },
  { id: "b12", member: "Priya Naidoo", className: "Slow Flow", startsAt: "Today · 17:30", status: "booked", credit: "Sage" },
  { id: "b13", member: "Mo Khumalo", className: "Sauna Journey", startsAt: "Today · 18:30", status: "booked", credit: "Wellzone" },
  { id: "b14", member: "Ella Tan", className: "Sauna Journey", startsAt: "Today · 18:30", status: "booked", credit: "Drop-in" },
  { id: "b15", member: "Brooke Wilson", className: "Power Yoga", startsAt: "Tomorrow · 07:00", status: "booked", credit: "All Access" },
  { id: "b16", member: "Asha Naidoo", className: "Sunrise Vinyasa", startsAt: "Tomorrow · 06:30", status: "booked", credit: "Trial" },
  { id: "b17", member: "Liam Pretorius", className: "Slow Flow", startsAt: "Fri · 17:30", status: "booked", credit: "Wellzone" },
  { id: "b18", member: "Thandi Mokoena", className: "Power Yoga", startsAt: "Sat · 08:00", status: "booked", credit: "12 Pack" },
];

export const promos: AdminPromo[] = [
  { id: "pr1", code: "WELCOME20", discount: "20% off first pack", validFrom: "Jan 1", validTo: "Dec 31", uses: 312, limit: 1000, status: "active" },
  { id: "pr2", code: "MAYFLOW", discount: "R200 off Sage", validFrom: "May 1", validTo: "May 31", uses: 47, limit: 200, status: "active" },
  { id: "pr3", code: "FRIEND25", discount: "25% off friend invite", validFrom: "Mar 1", validTo: "Jun 30", uses: 89, limit: 500, status: "active" },
  { id: "pr4", code: "SUMMER24", discount: "Free mat add-on", validFrom: "Dec 1", validTo: "Feb 28", uses: 540, limit: 540, status: "expired" },
];

export const badges: AdminBadge[] = [
  { id: "bd1", name: "First Flow", criteria: "Complete first class", earned: 1208, emoji: "🌱" },
  { id: "bd2", name: "31 Days of Movement", criteria: "Complete May challenge", earned: 0, emoji: "🏆" },
  { id: "bd3", name: "Sunrise Warrior", criteria: "10 morning classes", earned: 156, emoji: "🌅" },
  { id: "bd4", name: "Sauna Sage", criteria: "5 sauna journeys", earned: 87, emoji: "🔥" },
  { id: "bd5", name: "Friend Bringer", criteria: "Invite a friend who joins", earned: 64, emoji: "🤝" },
  { id: "bd6", name: "Century Club", criteria: "100 lifetime classes", earned: 22, emoji: "💯" },
];

export const waivers: AdminWaiver[] = [
  { id: "w1", version: "v3.2", publishedAt: "Mar 1, 2026", signed: 1280, required: true },
  { id: "w2", version: "v3.1", publishedAt: "Sep 4, 2025", signed: 142, required: false },
  { id: "w3", version: "Wellzone Addendum", publishedAt: "Feb 12, 2026", signed: 540, required: true },
];

export const payouts: AdminPayout[] = [
  { id: "po1", guide: "Asha Naidoo", period: "Apr 16 – Apr 30", hours: 38, classes: 24, amountCents: 1140000, status: "pending" },
  { id: "po2", guide: "Liam Pretorius", period: "Apr 16 – Apr 30", hours: 32, classes: 20, amountCents: 960000, status: "pending" },
  { id: "po3", guide: "Zinhle Khumalo", period: "Apr 16 – Apr 30", hours: 28, classes: 18, amountCents: 840000, status: "pending" },
  { id: "po4", guide: "Tendai Moyo", period: "Apr 1 – Apr 15", hours: 30, classes: 19, amountCents: 900000, status: "paid" },
  { id: "po5", guide: "Mika Sato", period: "Apr 1 – Apr 15", hours: 26, classes: 14, amountCents: 780000, status: "paid" },
];

export const timesheets: AdminTimesheet[] = [
  { id: "ts1", staff: "Asha Naidoo", role: "Guide", hours: 38, overtime: 2, rateCents: 30000 },
  { id: "ts2", staff: "Liam Pretorius", role: "Guide", hours: 32, overtime: 0, rateCents: 30000 },
  { id: "ts3", staff: "Zinhle Khumalo", role: "Guide", hours: 28, overtime: 0, rateCents: 30000 },
  { id: "ts4", staff: "Mika Sato", role: "Therapist", hours: 26, overtime: 0, rateCents: 30000 },
  { id: "ts5", staff: "Sam Reilly", role: "Front Desk", hours: 40, overtime: 4, rateCents: 18000 },
];

export const commLogs: AdminCommLog[] = [
  { id: "cl1", member: "Brooke Wilson", channel: "WhatsApp", subject: "Booking reminder — Sunrise Vinyasa", sentAt: "Today · 06:00", status: "delivered" },
  { id: "cl2", member: "Thandi Mokoena", channel: "Email", subject: "Welcome to One Flow", sentAt: "Today · 08:14", status: "opened" },
  { id: "cl3", member: "Liam Pretorius", channel: "Push", subject: "Your Wellzone is starting soon", sentAt: "Yesterday · 17:55", status: "delivered" },
  { id: "cl4", member: "Asha Naidoo", channel: "SMS", subject: "Trial expires tomorrow", sentAt: "Yesterday · 12:00", status: "delivered" },
  { id: "cl5", member: "Kerry van Wyk", channel: "Email", subject: "We miss you — 25% off", sentAt: "2 days ago", status: "failed" },
];

export const emailHistory: AdminEmailHistory[] = [
  { id: "eh1", subject: "May Challenge starts today", audience: "All members", recipients: 1342, sentAt: "May 1", openRate: 64 },
  { id: "eh2", subject: "Mother's Day brunch flow", audience: "Active members", recipients: 980, sentAt: "Apr 28", openRate: 51 },
  { id: "eh3", subject: "New Sauna Journey times", audience: "Wellzone members", recipients: 412, sentAt: "Apr 22", openRate: 72 },
];

// Bookings sparkline (last 7 days)
export const last7DaysBookings = [142, 168, 155, 188, 174, 196, 187];
