import { BOOKABLE_MEMBER_OR_FILTER } from "@/lib/bookableMembers";
import { supabase } from "@/lib/supabase";

export const ALL_MEMBERS_RECIPIENT = "__all_members__";

const BATCH_SIZE = 80;

/** All customer-capable profile ids (paginated). */
export async function fetchAllMemberProfileIds(): Promise<string[]> {
  const ids: string[] = [];
  const pageSize = 1000;
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .or(BOOKABLE_MEMBER_OR_FILTER)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const rows = data ?? [];
    for (const row of rows) {
      ids.push(String((row as { id: string }).id));
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return ids;
}

export async function sendInAppMessagesToMembers(args: {
  fromProfileId: string | null;
  profileIds: string[];
  subject: string | null;
  body: string;
  messageType: "direct" | "announcement";
}): Promise<{ sent: number; failed: number }> {
  const subject = args.subject?.trim() || null;
  const body = args.body.trim();
  if (!body) return { sent: 0, failed: 0 };

  const uniqueIds = [...new Set(args.profileIds.filter(Boolean))];
  if (uniqueIds.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const notifType = args.messageType === "announcement" ? "announcement" : "message";
  const notifTitle =
    subject || (args.messageType === "announcement" ? "Studio announcement" : "New message");

  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    const chunk = uniqueIds.slice(i, i + BATCH_SIZE);
    const messageInserts = chunk.map((profileId) => ({
      from_profile_id: args.fromProfileId,
      to_profile_id: profileId,
      subject,
      body,
      message_type: args.messageType,
    }));

    const { data: inserted, error: msgErr } = await supabase
      .from("studio_messages")
      .insert(messageInserts)
      .select("id, to_profile_id");

    if (msgErr || !inserted?.length) {
      failed += chunk.length;
      console.error("sendInAppMessagesToMembers batch", msgErr);
      continue;
    }

    const notifInserts = inserted.map((row) => ({
      profile_id: String((row as { to_profile_id: string }).to_profile_id),
      type: notifType,
      title: notifTitle,
      body: body.slice(0, 200) || null,
      metadata:
        notifType === "message"
          ? { studio_message_id: String((row as { id: string }).id) }
          : {},
    }));

    const { error: notifErr } = await supabase.from("notifications").insert(notifInserts);
    if (notifErr) {
      console.warn("sendInAppMessagesToMembers notifications", notifErr);
    }

    sent += inserted.length;
    failed += chunk.length - inserted.length;
  }

  return { sent, failed };
}
