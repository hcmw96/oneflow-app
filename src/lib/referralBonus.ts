/**
 * Refer-a-friend Flow Points — product rules (enforced in DB).
 *
 * Award: 500 points to the referrer when the referred friend creates their
 * FIRST non-cancelled booking (not at signup).
 *
 * Paths:
 * - Share link `?ref=<referrer_uuid>` → profiles.referred_by → referral_type `share_link`
 * - Email class-invite → referrals `class_invite_email` (and/or booking.class_invite_id)
 *
 * Idempotent: referrals.points_awarded flipped 0→500 once; cancel+rebook does not re-award.
 *
 * Manual check (Supabase SQL):
 *   select flow_points from profiles where id = '<referrer>';
 *   select * from flow_points where reason = 'referral_bonus' and profile_id = '<referrer>';
 *   select * from referrals where referred_id = '<friend>';
 */

export const REFERRAL_BONUS_POINTS = 500;
export const REFERRAL_TYPES = ["class_invite_email", "share_link"] as const;
export type ReferralType = (typeof REFERRAL_TYPES)[number];
