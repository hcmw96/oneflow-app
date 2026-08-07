import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Pre-class (≈1 hour) reminder emails are disabled — they consumed Resend credits
 * without enough value. Cron job `send-class-reminders` should be unscheduled.
 * Booking-confirmation and other transactional emails are unaffected.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      success: true,
      sent: 0,
      skipped: 0,
      disabled: true,
      message: "Class reminder emails are disabled.",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
