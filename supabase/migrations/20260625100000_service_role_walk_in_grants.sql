-- Edge functions (walk-in-checkin, yoco-checkout, invite-guide) use the service_role key.
-- This project only had explicit grants on offline_revenue; restore core table access.

grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.bookings to service_role;
grant select, insert, update, delete on public.challenge_checkins to service_role;
grant select on public.classes to service_role;
grant select, update on public.promotions to service_role;
grant select on public.studio_settings to service_role;
grant select on public.products to service_role;
grant select, insert, update, delete on public.user_credits to service_role;
grant select, insert, update on public.guides to service_role;
grant select, insert, update, delete on public.class_invites to service_role;
