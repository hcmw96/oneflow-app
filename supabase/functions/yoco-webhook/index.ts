import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const event = await req.json();

  if (event.type !== "payment.succeeded") return new Response("ok", { status: 200 });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const metadata = (event.payload?.metadata ?? {}) as Record<string, unknown>;
  const paymentType = String(metadata.type ?? "");

  // Class invite payments: inviter paid for friend's class.
  // For app friends (invitee_id set) we auto-book here; for email-only
  // invites the profile trigger handles the booking when they sign up.
  if (paymentType === "class_invite") {
    const classInviteId = String(metadata.class_invite_id ?? "").trim();
    if (!classInviteId) return new Response("ok", { status: 200 });
    const checkoutId = String(event.payload?.id ?? "");
    const yocoPaymentId = String(event.payload?.paymentId ?? checkoutId);

    // If this invite was sent to an email that already belongs to a member,
    // resolve the profile_id first so record_paid_class_invite can book.
    const { data: inv } = await supabase
      .from("class_invites")
      .select("id, invitee_id, invitee_email")
      .eq("id", classInviteId)
      .maybeSingle();
    const invRow = inv as { invitee_id: string | null; invitee_email: string | null } | null;
    if (invRow && !invRow.invitee_id && invRow.invitee_email) {
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", invRow.invitee_email)
        .maybeSingle();
      const existingId = (existing as { id?: string } | null)?.id;
      if (existingId) {
        await supabase
          .from("class_invites")
          .update({ invitee_id: existingId, invitee_email: null, invitee_name: null })
          .eq("id", classInviteId);
      }
    }

    const { error: rpcErr } = await supabase.rpc("record_paid_class_invite", {
      p_class_invite_id: classInviteId,
      p_yoco_payment_id: yocoPaymentId,
      p_checkout_id: checkoutId,
    });
    if (rpcErr) {
      console.error("record_paid_class_invite", rpcErr);
      return new Response("rpc failed", { status: 500 });
    }
    return new Response("ok", { status: 200 });
  }

  // Pack purchases (default path).
  const { pack_id, profile_id } = metadata as { pack_id?: string; profile_id?: string };
  if (!pack_id || !profile_id) return new Response("ok", { status: 200 });

  const { data: pack } = await supabase
    .from("products")
    .select("*")
    .eq("id", pack_id)
    .order("category", { ascending: true })
    .order("name", { ascending: true })
    .single();
  if (!pack) return new Response("Pack not found", { status: 404 });

  const credits =
    typeof (pack as { credit_count?: number }).credit_count === "number"
      ? (pack as { credit_count: number }).credit_count
      : Number((pack as { credits?: number }).credits ?? 0);

  await supabase.from("user_credits").insert({
    profile_id,
    product_id: pack_id,
    credits_remaining: credits,
    credit_type: pack.credit_type,
    purchased_at: new Date().toISOString(),
    expires_at: pack.validity_days
      ? new Date(Date.now() + pack.validity_days * 86400000).toISOString()
      : null,
  });

  await supabase.from("profiles").update({ late_cancel_fee_pending: false }).eq("id", profile_id);

  return new Response("ok", { status: 200 });
});
