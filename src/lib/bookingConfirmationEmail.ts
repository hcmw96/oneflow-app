/** Send-email template for a new booking (customer or admin walk-in). */
export function bookingConfirmationTemplateForClassType(
  classType: string | null | undefined,
): "booking_confirmation_sauna" | "booking_confirmation_class" {
  const s = String(classType ?? "").toLowerCase();
  if (s.includes("sauna") || s.includes("wellzone")) {
    return "booking_confirmation_sauna";
  }
  return "booking_confirmation_class";
}

/** Payload for send-email booking confirmation templates (`booking_confirmation_*`). */
export function bookingConfirmationEmailData(args: {
  className: string;
  startsAtIso: string;
  guideName?: string | null;
  location?: string | null;
  matAddon: boolean;
  towelAddon: boolean;
}): Record<string, unknown> {
  const start = new Date(args.startsAtIso);
  const date = start.toLocaleDateString("en-ZA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const time = start
    .toLocaleTimeString("en-ZA", { hour: "numeric", minute: "2-digit", hour12: true })
    .toUpperCase();
  return {
    class_name: args.className,
    date,
    time,
    guide_name: args.guideName?.trim() || "Guide",
    location: args.location?.trim() || "One Flow Studio",
    mat_addon: args.matAddon,
    towel_addon: args.towelAddon,
  };
}
