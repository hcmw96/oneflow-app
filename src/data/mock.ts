// Mock data layer for One Flow client app.
// Replace with backend wiring later. All times are local Africa/Johannesburg.

import { addDays, startOfDay } from "@/lib/format";

export type ClassType = "Yoga" | "Sculpt" | "Power" | "Wellzone" | "Sauna Journey";
export type Location = "Studio 1" | "Studio 2" | "Wellzone";

export interface Guide {
  id: string;
  name: string;
  initials: string;
  color: string; // hsl-ish accent for avatar fallback
}

export interface ClassSession {
  id: string;
  name: string;
  type: ClassType;
  startsAt: Date;
  durationMin: number;
  location: Location;
  guideId: string;
  capacity: number;
  booked: number;
}

export interface Booking {
  id: string;
  classId: string;
  status: "upcoming" | "attended" | "cancelled";
}

export interface Pack {
  id: string;
  name: string;
  category: "Class Packs" | "Wellzone" | "Power Packs";
  description: string;
  priceCents: number;
  badge?: string;
}

export interface PointsEntry {
  id: string;
  date: Date;
  label: string;
  delta: number;
}

export const guides: Guide[] = [
  { id: "g1", name: "Asha Naidoo", initials: "AN", color: "#a3b693" },
  { id: "g2", name: "Liam Pretorius", initials: "LP", color: "#c8b88a" },
  { id: "g3", name: "Zinhle Khumalo", initials: "ZK", color: "#b39ac8" },
  { id: "g4", name: "Mika Sato", initials: "MS", color: "#e0a890" },
  { id: "g5", name: "Tendai Moyo", initials: "TM", color: "#8aafc8" },
];

const today = startOfDay(new Date());

const make = (
  dayOffset: number,
  hour: number,
  minute: number,
  partial: Omit<ClassSession, "id" | "startsAt">,
): ClassSession => {
  const startsAt = new Date(today);
  startsAt.setDate(startsAt.getDate() + dayOffset);
  startsAt.setHours(hour, minute, 0, 0);
  return { id: `c-${dayOffset}-${hour}-${minute}-${partial.name}`, startsAt, ...partial };
};

// 7 days of plausible classes
export const classes: ClassSession[] = [
  make(0, 6, 30, { name: "Sunrise Vinyasa", type: "Yoga", durationMin: 60, location: "Studio 1", guideId: "g1", capacity: 20, booked: 14 }),
  make(0, 9, 0, { name: "Sculpt & Tone", type: "Sculpt", durationMin: 50, location: "Studio 2", guideId: "g2", capacity: 16, booked: 15 }),
  make(0, 17, 30, { name: "Slow Flow", type: "Yoga", durationMin: 60, location: "Studio 1", guideId: "g3", capacity: 20, booked: 8 }),
  make(0, 18, 30, { name: "Sauna Journey", type: "Sauna Journey", durationMin: 75, location: "Wellzone", guideId: "g4", capacity: 12, booked: 10 }),

  make(1, 6, 30, { name: "Power Yoga", type: "Power", durationMin: 60, location: "Studio 1", guideId: "g5", capacity: 20, booked: 6 }),
  make(1, 12, 0, { name: "Lunch Sculpt", type: "Sculpt", durationMin: 45, location: "Studio 2", guideId: "g2", capacity: 16, booked: 4 }),
  make(1, 18, 0, { name: "Wellzone Open", type: "Wellzone", durationMin: 90, location: "Wellzone", guideId: "g4", capacity: 25, booked: 12 }),

  make(2, 6, 30, { name: "Sunrise Vinyasa", type: "Yoga", durationMin: 60, location: "Studio 1", guideId: "g1", capacity: 20, booked: 9 }),
  make(2, 17, 30, { name: "Yin & Restore", type: "Yoga", durationMin: 75, location: "Studio 1", guideId: "g3", capacity: 20, booked: 17 }),

  make(3, 7, 0, { name: "Power Yoga", type: "Power", durationMin: 60, location: "Studio 1", guideId: "g5", capacity: 20, booked: 11 }),
  make(3, 18, 30, { name: "Sauna Journey", type: "Sauna Journey", durationMin: 75, location: "Wellzone", guideId: "g4", capacity: 12, booked: 12 }),

  make(4, 6, 30, { name: "Sunrise Vinyasa", type: "Yoga", durationMin: 60, location: "Studio 1", guideId: "g1", capacity: 20, booked: 5 }),
  make(4, 9, 0, { name: "Sculpt & Tone", type: "Sculpt", durationMin: 50, location: "Studio 2", guideId: "g2", capacity: 16, booked: 13 }),

  make(5, 8, 0, { name: "Saturday Slow Flow", type: "Yoga", durationMin: 75, location: "Studio 1", guideId: "g3", capacity: 22, booked: 18 }),
  make(5, 10, 0, { name: "Sculpt Express", type: "Sculpt", durationMin: 40, location: "Studio 2", guideId: "g2", capacity: 16, booked: 7 }),

  make(6, 9, 0, { name: "Sunday Restore", type: "Yoga", durationMin: 90, location: "Studio 1", guideId: "g1", capacity: 22, booked: 6 }),
];

export const bookings: Booking[] = [
  { id: "b1", classId: classes[0].id, status: "upcoming" },
  { id: "b2", classId: classes[6].id, status: "upcoming" },
  { id: "b3", classId: "past-1", status: "attended" },
  { id: "b4", classId: "past-2", status: "attended" },
];

export const pastClasses: Record<string, { name: string; type: ClassType; startsAt: Date; guideId: string }> = {
  "past-1": { name: "Slow Flow", type: "Yoga", startsAt: addDays(today, -2), guideId: "g3" },
  "past-2": { name: "Sculpt & Tone", type: "Sculpt", startsAt: addDays(today, -5), guideId: "g2" },
};

export const packs: Pack[] = [
  { id: "p1", name: "6 Class Pack", category: "Class Packs", description: "Six classes, valid 3 months.", priceCents: 90000 },
  { id: "p2", name: "12 Class Pack", category: "Class Packs", description: "Twelve classes, valid 6 months.", priceCents: 168000, badge: "Popular" },
  { id: "p3", name: "Digital Nomad", category: "Class Packs", description: "Unlimited 30 days.", priceCents: 220000 },
  { id: "p4", name: "Mat & Towel Pack", category: "Class Packs", description: "Mat + towel for 10 classes.", priceCents: 35000 },
  { id: "p5", name: "Wellzone Unlimited", category: "Wellzone", description: "Unlimited Wellzone access, 30 days.", priceCents: 120000 },
  { id: "p6", name: "Sauna Journey", category: "Wellzone", description: "Single guided journey.", priceCents: 28000 },
  { id: "p7", name: "Wellzone Drop-In", category: "Wellzone", description: "Single Wellzone session.", priceCents: 18000 },
  { id: "p8", name: "Double Flow", category: "Power Packs", description: "Yoga + Wellzone, 30 days unlimited.", priceCents: 240000 },
  { id: "p9", name: "Seeker", category: "Power Packs", description: "All studio classes, monthly.", priceCents: 195000 },
  { id: "p10", name: "Sage", category: "Power Packs", description: "All Access including Wellzone.", priceCents: 295000, badge: "Best value" },
  { id: "p11", name: "All Access", category: "Power Packs", description: "Everything One Flow offers.", priceCents: 395000 },
];

export const pointsHistory: PointsEntry[] = [
  { id: "pt1", date: addDays(today, -1), label: "Sunrise Vinyasa", delta: 1 },
  { id: "pt2", date: addDays(today, -3), label: "Slow Flow", delta: 1 },
  { id: "pt3", date: addDays(today, -5), label: "Café spend R80", delta: 8 },
  { id: "pt4", date: addDays(today, -10), label: "Friend referral", delta: 1000 },
  { id: "pt5", date: addDays(today, -14), label: "Sculpt & Tone", delta: 1 },
];

export const user = {
  name: "Mia",
  email: "mia@example.com",
  weeklyGoal: 4,
  thisWeekCount: 2,
  streak: 6,
  pointsBalance: 1247,
  challengeProgress: 14, // /31
};

// 31 Days of Movement Challenge (May)
export type ChallengeType = "Yoga" | "Sauna Journey";

export interface ChallengeCheckIn {
  id: string;
  date: Date;
  type: ChallengeType;
  className: string;
}

const CHALLENGE_YEAR = today.getFullYear();
const CHALLENGE_MONTH = 4; // May (0-indexed)

export const challenge = {
  id: `may-${CHALLENGE_YEAR}`,
  title: "31 Days of Movement",
  startDate: new Date(CHALLENGE_YEAR, CHALLENGE_MONTH, 1),
  endDate: new Date(CHALLENGE_YEAR, CHALLENGE_MONTH, 31),
  totalDays: 31,
  maxPerDay: 2,
  qualifyingTypes: ["Yoga", "Sauna Journey"] as const,
};

// Seed mock check-ins for ~14 of the first days of May
const seedDays = [1, 2, 3, 5, 6, 7, 8, 10, 11, 12, 14, 15, 17, 18];
const seedSamples: { type: ChallengeType; className: string }[] = [
  { type: "Yoga", className: "Sunrise Vinyasa" },
  { type: "Yoga", className: "Slow Flow" },
  { type: "Sauna Journey", className: "Sauna Journey" },
  { type: "Yoga", className: "Power Yoga" },
  { type: "Yoga", className: "Yin & Restore" },
];

export const challengeCheckIns: ChallengeCheckIn[] = seedDays.map((d, i) => {
  const sample = seedSamples[i % seedSamples.length];
  const date = new Date(CHALLENGE_YEAR, CHALLENGE_MONTH, d, 7, 0, 0);
  return { id: `ci-${d}`, date, type: sample.type, className: sample.className };
});

// Add one bonus second check-in on day 6 to demo max-2/day
challengeCheckIns.push({
  id: "ci-6b",
  date: new Date(CHALLENGE_YEAR, CHALLENGE_MONTH, 6, 18, 30, 0),
  type: "Sauna Journey",
  className: "Sauna Journey",
});

export const getChallengeCheckInsForDay = (day: number) =>
  challengeCheckIns.filter((c) => c.date.getDate() === day);

export const getStampedDays = (): Set<number> => {
  const s = new Set<number>();
  for (const c of challengeCheckIns) s.add(c.date.getDate());
  return s;
};

export const isChallengeComplete = () => getStampedDays().size >= challenge.totalDays;

export const qualifiesForChallenge = (session: { type: ClassType }) =>
  session.type === "Yoga" || session.type === "Sauna Journey";

export const getClassById = (id: string) => classes.find((c) => c.id === id);
export const getGuide = (id: string) => guides.find((g) => g.id === id);

export const upcomingBookings = () =>
  bookings
    .filter((b) => b.status === "upcoming")
    .map((b) => ({ booking: b, session: getClassById(b.classId) }))
    .filter((x): x is { booking: Booking; session: ClassSession } => !!x.session)
    .sort((a, b) => a.session.startsAt.getTime() - b.session.startsAt.getTime());
