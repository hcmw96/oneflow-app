import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultAllowedClassTypesForCreditCategory } from "@/lib/allowedClassTypes";

export type ClassTicketProductInput = {
  className: string;
  classType: string;
  priceZar: number;
  startsAt: Date;
  description?: string | null;
};

function ticketCategory(classType: string, priceZar: number): string {
  const t = classType.trim().toLowerCase();
  if (t === "wellzone" || t === "sauna_journey") return "wellzone";
  if (t === "power") return "power";
  if (priceZar <= 0) return "complimentary";
  return "yoga";
}

function validityDaysForClass(startsAt: Date): number {
  const ms = startsAt.getTime() - Date.now();
  const daysUntil = Math.ceil(ms / 86_400_000);
  return Math.max(1, Math.min(365, daysUntil + 1));
}

function formatTicketDate(startsAt: Date): string {
  return startsAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  });
}

/** Create a single-use ticket product for a scheduled class/event. */
export async function createClassTicketProduct(
  client: SupabaseClient,
  input: ClassTicketProductInput,
): Promise<string> {
  const className = input.className.trim();
  const classType = input.classType.trim().toLowerCase();
  const price = Math.max(0, Math.round(input.priceZar));
  const dateLabel = formatTicketDate(input.startsAt);
  const category = ticketCategory(classType, price);
  const allowed =
    classType.length > 0
      ? [classType]
      : [...defaultAllowedClassTypesForCreditCategory(category)];

  const { data, error } = await client
    .from("products")
    .insert({
      name: `${className} (${dateLabel})`,
      description:
        input.description?.trim() ||
        `Ticket for ${className} on ${dateLabel}.`,
      price_zar: price,
      credit_count: 1,
      validity_days: validityDaysForClass(input.startsAt),
      category,
      allowed_class_types: allowed,
      is_addon: false,
      is_staff_only: false,
      is_active: true,
      is_class_ticket: true,
      sort_order: 9999,
    })
    .select("id")
    .single();

  if (error) throw error;
  const id = (data as { id?: string } | null)?.id;
  if (!id) throw new Error("Ticket product was not created");
  return id;
}

export async function updateClassTicketProduct(
  client: SupabaseClient,
  productId: string,
  input: ClassTicketProductInput,
): Promise<void> {
  const className = input.className.trim();
  const classType = input.classType.trim().toLowerCase();
  const price = Math.max(0, Math.round(input.priceZar));
  const dateLabel = formatTicketDate(input.startsAt);
  const category = ticketCategory(classType, price);

  const { error } = await client
    .from("products")
    .update({
      name: `${className} (${dateLabel})`,
      description:
        input.description?.trim() ||
        `Ticket for ${className} on ${dateLabel}.`,
      price_zar: price,
      validity_days: validityDaysForClass(input.startsAt),
      category,
      allowed_class_types:
        classType.length > 0
          ? [classType]
          : [...defaultAllowedClassTypesForCreditCategory(category)],
    })
    .eq("id", productId);

  if (error) throw error;
}

export function parseTicketPriceZar(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export function formatTicketPriceLabel(zar: number): string {
  if (zar <= 0) return "Free";
  return `R${zar.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
}
