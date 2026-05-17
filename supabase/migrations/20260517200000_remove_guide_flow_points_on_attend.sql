-- Guides do not earn Flow Points on class attendance (reverts 20260517160000).

drop trigger if exists trigger_award_guide_flow_points on public.bookings;

drop function if exists public.award_guide_flow_points();
