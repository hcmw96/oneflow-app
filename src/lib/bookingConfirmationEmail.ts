/** Send-email template for a new booking (customer or admin walk-in). */
import {
  formatStudioDateLong,
  formatStudioTime12Upper,
} from "@/lib/timezone";
import { bookingConfirmationTemplateForClassType } from "@/lib/allowedClassTypes";

export { bookingConfirmationTemplateForClassType };

/** Payload for send-email booking confirmation templates (`booking_confirmation_*`). */
export function bookingConfirmationEmailData(args: {
  className: string;
  startsAtIso: string;
  guideName?: string | null;
  location?: string | null;
  matAddon: boolean;
  towelAddon: boolean;
}): Record<string, unknown> {
  const date = formatStudioDateLong(args.startsAtIso);
  const time = formatStudioTime12Upper(args.startsAtIso);
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
