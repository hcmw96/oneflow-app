import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Check, Coffee, Sparkles, Sunrise, Waves, Lock } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  challenge,
  challengeCheckIns,
  getChallengeCheckInsForDay,
  getStampedDays,
  isChallengeComplete,
  type ChallengeCheckIn,
} from "@/data/mock";
import { cn } from "@/lib/utils";
import challengeBg from "@/assets/challenge-bg.jpg";

export const Route = createFileRoute("/challenge")({
  head: () => ({
    meta: [
      { title: "31 Days of Movement — One Flow" },
      {
        name: "description",
        content:
          "Track your May challenge: earn a stamp for every Yoga class or Sauna Journey and unlock a Completion Reward.",
      },
      { property: "og:title", content: "31 Days of Movement — One Flow" },
      {
        property: "og:description",
        content:
          "Earn a stamp for every Yoga class or Sauna Journey across May. Complete all 31 days to unlock your reward.",
      },
    ],
  }),
  component: ChallengePage,
});

function ChallengePage() {
  const stamped = getStampedDays();
  const complete = isChallengeComplete();
  const today = new Date();
  const isMay =
    today.getFullYear() === challenge.startDate.getFullYear() &&
    today.getMonth() === challenge.startDate.getMonth();
  const todayDay = isMay ? today.getDate() : 0;
  const stampedCount = stamped.size;
  const remaining = challenge.totalDays - stampedCount;
  const pct = Math.min(100, (stampedCount / challenge.totalDays) * 100);

  const [activeDay, setActiveDay] = useState<number | null>(null);
  const dayCheckIns: ChallengeCheckIn[] =
    activeDay != null ? getChallengeCheckInsForDay(activeDay) : [];

  const days = Array.from({ length: challenge.totalDays }, (_, i) => i + 1);

  return (
    <AppShell>
      <div className="flex items-center px-5 pt-3">
        <Link
          to="/"
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </div>

      <main className="flex-1 space-y-5 px-5 pt-3">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl">
          <img
            src={challengeBg}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/55 to-black/30" />
          <div className="relative p-6">
            <span className="inline-block rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-primary-foreground">
              May Challenge
            </span>
            <h1 className="mt-3 font-display text-3xl font-bold leading-tight text-white">
              31 Days of <br /> Movement
            </h1>
            <p className="mt-2 text-sm text-white/80">
              {stampedCount} of {challenge.totalDays} days stamped
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-white/70">
              Yoga classes & Sauna Journeys count · Max 2 stamps per day
            </p>
          </div>
        </section>

        {/* Stamp card */}
        <section className="rounded-3xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Your stamp card</h2>
            <span className="text-xs font-medium text-muted-foreground">
              {stampedCount}/{challenge.totalDays}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-3">
            {days.map((day) => {
              const isStamped = stamped.has(day);
              const isToday = day === todayDay;
              const isFuture = isMay && day > todayDay;
              const isMissed = !isStamped && !isToday && !isFuture;
              const dayCount = isStamped
                ? challengeCheckIns.filter((c) => c.date.getDate() === day).length
                : 0;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => isStamped && setActiveDay(day)}
                  disabled={!isStamped}
                  className={cn(
                    "relative flex aspect-square items-center justify-center rounded-full text-sm font-bold transition-transform",
                    isStamped &&
                      "rotate-[-6deg] bg-primary text-primary-foreground shadow-sm active:scale-95",
                    isToday && !isStamped && "border-2 border-primary text-foreground",
                    isFuture && "border border-dashed border-border text-muted-foreground/50",
                    isMissed && "bg-muted text-muted-foreground/60",
                  )}
                  aria-label={`Day ${day}${isStamped ? " — stamped" : ""}`}
                >
                  <span className="relative z-10">{day}</span>
                  {isStamped && (
                    <Check className="absolute inset-0 m-auto h-7 w-7 opacity-25" strokeWidth={3} />
                  )}
                  {isStamped && dayCount > 1 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[9px] font-bold text-background">
                      {dayCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">
            Yoga classes and Sauna Journeys count toward your streak. Unguided Wellzone sessions
            don't count. Maximum 2 stamps per day.
          </p>
        </section>

        {/* Completion reward */}
        <section
          className={cn(
            "overflow-hidden rounded-3xl border p-5",
            complete
              ? "border-primary bg-primary/10"
              : "border-border bg-card",
          )}
        >
          <div className="flex items-center gap-2">
            {complete ? (
              <Sparkles className="h-5 w-5 text-primary" />
            ) : (
              <Lock className="h-5 w-5 text-muted-foreground" />
            )}
            <h2 className="font-display text-lg font-bold">Completion Reward</h2>
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            {complete
              ? "You completed all 31 days — show this to the studio team to claim:"
              : `${remaining} ${remaining === 1 ? "day" : "days"} to go. Finish all 31 to unlock:`}
          </p>

          <ul className="mt-4 space-y-3">
            <RewardRow icon={Sunrise} label="Specialized morning class" />
            <RewardRow icon={Coffee} label="Complimentary protein shake or coffee" />
            <RewardRow icon={Waves} label="Complimentary unguided Wellzone session" />
          </ul>

          <button
            type="button"
            disabled={!complete}
            onClick={() =>
              toast.success("Reward unlocked", {
                description: "Show this screen to the studio team to claim your perks.",
              })
            }
            className={cn(
              "mt-5 w-full rounded-xl py-3 text-sm font-semibold transition-opacity",
              complete
                ? "bg-primary text-primary-foreground active:opacity-90"
                : "cursor-not-allowed bg-muted text-muted-foreground",
            )}
          >
            {complete ? "Claim reward" : "Locked"}
          </button>
        </section>
      </main>

      {/* Day detail sheet */}
      <Sheet open={activeDay != null} onOpenChange={(o) => !o && setActiveDay(null)}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl border-0 bg-background p-0"
        >
          <div className="px-6 pb-8 pt-6">
            <SheetHeader className="text-center">
              <SheetTitle className="font-display text-2xl font-bold">
                May {activeDay}
              </SheetTitle>
              <SheetDescription className="text-sm text-muted-foreground">
                {dayCheckIns.length} stamp{dayCheckIns.length === 1 ? "" : "s"} earned
              </SheetDescription>
            </SheetHeader>
            <ul className="mt-5 space-y-2">
              {dayCheckIns.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{c.className}</p>
                    <p className="text-xs text-muted-foreground">{c.type}</p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function RewardRow({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <li className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm">{label}</span>
    </li>
  );
}
