import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [{ title: "FAQ — One Flow" }],
  }),
  component: FaqPage,
});

const ITEMS: { q: string; a: string }[] = [
  {
    q: "How do I book a class?",
    a: "All classes can be booked up to 2 weeks in advance through the app. We recommend pre-registering to secure your spot.",
  },
  {
    q: "What happens if I arrive late?",
    a: "Classes start punctually and late entry is not permitted once doors close. Please arrive 10–15 minutes early. Late arrivals may result in your spot being given to a waitlisted Seeker.",
  },
  {
    q: "How does the waitlist work?",
    a: "If a class is full, join the waitlist. You must have an available credit to do so. If added from the waitlist, you'll be notified and are responsible for attending or cancelling.",
  },
  {
    q: "What is the cancellation policy?",
    a: "Cancellations more than 2 hours before class: your credit is returned. Cancellations within 2 hours: credit is returned but a R100 late cancellation fee applies on your next transaction.",
  },
  {
    q: "Are refunds available?",
    a: "No refunds are issued on any class packages, monthly memberships, or gift cards.",
  },
  {
    q: "What should I bring to a Sauna Journey?",
    a: "Bring a shower towel only. Bathing suits are required. One Flow is a barefoot space beyond the changing rooms.",
  },
  {
    q: "Are phones allowed in the studio?",
    a: "No phones are allowed beyond the entrance and common area. Please keep your phone on silent in the locker. Disconnect to reconnect.",
  },
  {
    q: "What is the dress code?",
    a: "Bathing suits are required for all Seekers. The studio is a barefoot space beyond the changing rooms. Gender-neutral changing stalls are available.",
  },
  {
    q: "Can I rent a mat or towel?",
    a: "Yes — yoga mats and towels are available to rent. Seekers receive one Wellzone towel per visit. Select the add-on when booking.",
  },
  {
    q: "Is alcohol permitted?",
    a: "No. One Flow is an alcohol-free establishment. Please arrive sober and clear-headed to fully engage in your session.",
  },
];

function FaqPage() {
  return (
    <AppShell>
      <header className="safe-top flex items-center gap-3 px-5 pt-3 pb-2">
        <Link
          to="/me"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="font-display text-lg font-semibold">FAQ & help</h1>
      </header>
      <main className="flex-1 space-y-4 px-5 pb-10 pt-2">
        <p className="text-sm text-muted-foreground">
          Quick answers to common questions about booking, studio etiquette, and policies.
        </p>
        <Accordion
          type="single"
          collapsible
          className="w-full rounded-2xl border border-border bg-card px-4"
        >
          {ITEMS.map((item, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="border-border last:border-b-0">
              <AccordionTrigger className="py-4 text-left text-sm font-semibold text-[#a3b693] hover:no-underline">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </main>
    </AppShell>
  );
}
