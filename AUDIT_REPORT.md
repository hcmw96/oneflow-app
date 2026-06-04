# OneFlow — Static Application Audit

**Date:** 2026-05-22  
**Method:** Static analysis only (code + migrations vs ground-truth schema). No runtime clicks.

---

## Application surface

### Routes (`src/routes/` — 44 files)

| File |
|------|
| `__root.tsx` |
| `admin.badges.tsx` |
| `admin.bookings.tsx` |
| `admin.check-in.tsx` |
| `admin.classes.tsx` |
| `admin.client-comms.tsx` |
| `admin.customers.$customerId.tsx` |
| `admin.customers.tsx` |
| `admin.email.tsx` |
| `admin.guides.tsx` |
| `admin.index.tsx` |
| `admin.install-app.tsx` |
| `admin.payouts.tsx` |
| `admin.products.tsx` |
| `admin.promotions.tsx` |
| `admin.reports.tsx` |
| `admin.schedule.tsx` |
| `admin.scheduling.tsx` |
| `admin.settings.tsx` |
| `admin.staff.tsx` |
| `admin.timesheets.tsx` |
| `admin.transactions.tsx` |
| `admin.tsx` |
| `admin.waivers.tsx` |
| `admin.whatsapp.tsx` |
| `auth.callback.tsx` |
| `auth.reset-password.tsx` |
| `auth.tsx` |
| `bookings.tsx` |
| `cafe.tsx` |
| `challenge.tsx` |
| `class.$classId.tsx` |
| `faq.tsx` |
| `goals.tsx` |
| `index.tsx` |
| `me.friends.tsx` |
| `me.tsx` |
| `notifications.tsx` |
| `onboarding.tsx` |
| `packages.tsx` |
| `payment.success.tsx` |
| `pricing.tsx` |
| `rewards.tsx` |
| `schedule.tsx` |

### Components (`src/components/` — 74 files)

| File |
|------|
| `AppShell.tsx` |
| `BookingSheet.tsx` |
| `BottomNav.tsx` |
| `ClassCard.tsx` |
| `ClassReviewPrompt.tsx` |
| `FriendsPanel.tsx` |
| `PageTransition.tsx` |
| `TypeBadge.tsx` |
| `WhatsAppFab.tsx` |
| `admin/AdminComingSoon.tsx` |
| `admin/AdminEmptyState.tsx` |
| `admin/AdminGlobalSearch.tsx` |
| `admin/AdminNav.tsx` |
| `admin/AdminShell.tsx` |
| `admin/AdminTableWrap.tsx` |
| `admin/AssignPackageDialog.tsx` |
| `admin/CheckInClassAccordion.tsx` |
| `admin/CheckInRosterList.tsx` |
| `admin/CheckInRosterMemberAvatar.tsx` |
| `admin/CheckInRosterStatusPill.tsx` |
| `admin/ClassRosterSheet.tsx` |
| `admin/CustomerProfileSheet.tsx` |
| `admin/GuideActivePackagePills.tsx` |
| `admin/LeaveRequestsBlock.tsx` |
| `admin/PageHeader.tsx` |
| `admin/QRScanner.tsx` |
| `admin/RosterAddonPills.tsx` |
| `admin/StatCard.tsx` |
| `ui/accordion.tsx` |
| `ui/alert-dialog.tsx` |
| `ui/alert.tsx` |
| `ui/aspect-ratio.tsx` |
| `ui/avatar.tsx` |
| `ui/badge.tsx` |
| `ui/breadcrumb.tsx` |
| `ui/button.tsx` |
| `ui/calendar.tsx` |
| `ui/card.tsx` |
| `ui/carousel.tsx` |
| `ui/chart.tsx` |
| `ui/checkbox.tsx` |
| `ui/collapsible.tsx` |
| `ui/command.tsx` |
| `ui/context-menu.tsx` |
| `ui/dialog.tsx` |
| `ui/drawer.tsx` |
| `ui/dropdown-menu.tsx` |
| `ui/form.tsx` |
| `ui/hover-card.tsx` |
| `ui/input-otp.tsx` |
| `ui/input.tsx` |
| `ui/label.tsx` |
| `ui/menubar.tsx` |
| `ui/navigation-menu.tsx` |
| `ui/pagination.tsx` |
| `ui/popover.tsx` |
| `ui/progress.tsx` |
| `ui/radio-group.tsx` |
| `ui/resizable.tsx` |
| `ui/scroll-area.tsx` |
| `ui/select.tsx` |
| `ui/separator.tsx` |
| `ui/sheet.tsx` |
| `ui/sidebar.tsx` |
| `ui/skeleton.tsx` |
| `ui/slider.tsx` |
| `ui/sonner.tsx` |
| `ui/switch.tsx` |
| `ui/table.tsx` |
| `ui/tabs.tsx` |
| `ui/textarea.tsx` |
| `ui/toggle-group.tsx` |
| `ui/toggle.tsx` |
| `ui/tooltip.tsx` |

---

## Issues (by severity)

### [CRITICAL] `classes.booked_count` is never incremented on booking

- **Location:** `src/components/BookingSheet.tsx` (booking insert ~269–324); repo-wide — no increment found
- **Workflow affected:** Customer books a class; schedule shows Reserve/Full; admin capacity views
- **What's wrong:** Bookings are inserted but `classes.booked_count` is never increased. The only client-side update is **decrement** on cancel (`src/lib/bookingCancellation.ts` ~116–121). No DB trigger for `booked_count` exists in `supabase/migrations/`.
- **Why it breaks:** UI capacity (`session.capacity - session.booked_count` in `BookingSheet.tsx` ~198, `schedule.tsx` ~530) stays stale at 0 or an old value → classes never show Full, overbooking is possible, dashboard occupancy is wrong.
- **Proposed fix:** Add a `BEFORE INSERT` / `AFTER INSERT` trigger on `bookings` (non-cancelled) to increment `booked_count`, and decrement on cancel; or increment in the booking insert path and keep cancel decrement in sync:

```sql
-- Example trigger (run in Supabase SQL editor; not executed here)
create or replace function public.sync_class_booked_count()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.status is distinct from 'cancelled' then
    update public.classes set booked_count = coalesce(booked_count,0) + 1 where id = new.class_id;
  elsif tg_op = 'UPDATE' and old.status is distinct from 'cancelled' and new.status = 'cancelled' then
    update public.classes set booked_count = greatest(0, coalesce(booked_count,0) - 1) where id = new.class_id;
  end if;
  return coalesce(new, old);
end; $$;
```

- **Confidence:** High

---

### [CRITICAL] Flow Points awarded on booking confirm (wrong event, wrong amount)

- **Location:** `src/components/BookingSheet.tsx` ~214–224
- **Workflow affected:** Customer books a class
- **What's wrong:** After insert, `afterBookingConfirmed` writes to `flow_points` with `reason: "class_attended"` and `points: 1` while status is still **`confirmed`**, not `attended`.
- **Why it breaks:** DB trigger `award_flow_points_on_attend` (`supabase/migrations/20260520100000_exclude_guide_director_flow_points.sql`) awards **+10** to `profiles.flow_points` when status becomes `attended`. This frontend write uses the attend reason at confirm time (+1 to ledger), mis-timed and inconsistent with the trigger (+10 on attend). Members can show incorrect ledger/history and Jeanae sees “points for classes they never attended.”
- **Proposed fix:** Remove the insert block entirely; rely on the DB trigger at check-in:

```tsx
// Delete lines 215–225 in afterBookingConfirmed — do not insert flow_points on confirm
```

- **Confidence:** High

---

### [CRITICAL] “Pay with Flow Points” booking does not deduct balance

- **Location:** `src/components/BookingSheet.tsx` ~304–324
- **Workflow affected:** Customer books using Flow Points as payment method
- **What's wrong:** When `usePoints` is true and no credit is selected, the booking is inserted with `payment_method: "flow_points"` and `flow_points_used: Math.min(flowPoints, 100)`, but **`redeem_my_flow_points` is never called** (contrast `src/routes/payment.success.tsx` ~55–60 which calls the RPC for pack checkout).
- **Why it breaks:** `profiles.flow_points` balance is unchanged; member gets a free class. Cancel path (`bookingCancellation.ts`) also does not restore points spent via `flow_points_used`.
- **Proposed fix:** Before or after successful booking insert, call the same RPC used on pricing success:

```tsx
if (usePoints && !selectedCredit) {
  const used = Math.min(flowPoints, 100);
  const { error: redeemErr } = await supabase.rpc("redeem_my_flow_points", { p_amount: used });
  if (redeemErr) { /* abort / toast */ return; }
}
```

Also refund on cancel when `payment_method === 'flow_points'`.

- **Confidence:** High

---

### [CRITICAL] Reports query uses invalid role `member`

- **Location:** `src/routes/admin.reports.tsx` ~230–236
- **Workflow affected:** Admin → Reports (new signups, active/lapsed members)
- **What's wrong:** `.eq("role", "member")` — `member` is **not** in the `profiles.role` enum (`customer`, `director`, `management`, `guide`, `boh`, `front_desk`, `marketing`, `team`).
- **Why it breaks:** PostgREST enum filter returns zero rows or errors → `newSignups`, `activeMembers`, and `lapsedMembers` are always null/zero.
- **Proposed fix:**

```tsx
.eq("role", "customer")
// Optionally also include profiles where secondary_roles @> ARRAY['customer']::text[]
```

- **Confidence:** High

---

### [CRITICAL] Leave requests RLS allows any authenticated user full access

- **Location:** `supabase/migrations/20260512220000_leave_requests.sql` ~23–27; used by `src/components/admin/LeaveRequestsBlock.tsx`
- **Workflow affected:** Leave requests (staff submit, management review)
- **What's wrong:** Policy `leave_requests_all` is `using (true) with check (true)` for **all** operations to **authenticated**.
- **Why it breaks:** Any logged-in **customer** can select/update/delete all leave rows (including sick-note paths) and approve their own requests. Storage policy `leave_documents_select_authenticated` also allows any authenticated user to read all sick notes in the bucket.
- **Proposed fix:** Replace with role-scoped policies (staff insert own; director/management select/update all; customers denied). Example:

```sql
drop policy leave_requests_all on public.leave_requests;
create policy leave_requests_insert_own on public.leave_requests
  for insert to authenticated with check (profile_id = auth.uid());
create policy leave_requests_select_staff on public.leave_requests
  for select to authenticated using (
    profile_id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid()
      and lower(p.role::text) in ('director','management'))
  );
-- Similar for update/delete
```

- **Confidence:** High (policy text is explicit)

---

### [HIGH] Reports selects non-existent `user_credits.price_zar`

- **Location:** `src/routes/admin.reports.tsx` ~216–221, ~267
- **Workflow affected:** Admin → Reports revenue
- **What's wrong:** Query selects `price_zar` from `user_credits`. Ground-truth schema lists no `price_zar` on `user_credits` (price lives on `products.price_zar`).
- **Why it breaks:** Query may error or revenue falls back to `0` via `Number(row.price_zar ?? prod?.price_zar ?? 0)`.
- **Proposed fix:** Remove `price_zar` from the `user_credits` select; rely on joined `products ( price_zar )` only, or join `yoco`/transactions if that is the revenue source of truth.

- **Confidence:** High

---

### [HIGH] “Already booked” / overlap checks ignore `attended` status

- **Location:** `src/lib/scheduleBooking.ts` ~58–62; consumers: `src/routes/schedule.tsx` ~218, `src/components/BookingSheet.tsx` ~260
- **Workflow affected:** Browse schedule → overlap prevention; Book class
- **What's wrong:** `fetchConfirmedBookingIntervals` filters `.eq("status", "confirmed")` only.
- **Why it breaks:** A member checked in (`status = 'attended'`) for an overlapping future slot (edge case) or same-day overlap logic treats attended bookings as free, allowing double-booking. Schedule “Booked” badge can disappear after check-in while class is still in progress.
- **Proposed fix:**

```tsx
.in("status", ["confirmed", "attended"])
```

- **Confidence:** High

---

### [HIGH] Home upcoming bookings drop checked-in classes still in progress

- **Location:** `src/lib/homeUpcomingBookings.ts` ~44
- **Workflow affected:** Home screen → Your bookings
- **What's wrong:** Same `.eq("status", "confirmed")` filter.
- **Why it breaks:** After QR check-in, booking becomes `attended` and vanishes from home/upcoming list even if class hasn’t ended (`ends_at > now`).
- **Proposed fix:** `.in("status", ["confirmed", "attended"])` with existing `ends_at > nowMs` filter.

- **Confidence:** High

---

### [HIGH] Campaign “active members” uses booking `created_at`, not class date

- **Location:** `src/lib/campaignRecipients.ts` ~74–81
- **Workflow affected:** Admin → Email campaigns / client comms recipient filter “active”
- **What's wrong:** `.gte("created_at", since.toISOString())` on `bookings` without joining `classes.starts_at`.
- **Why it breaks:** A booking made today for a class next month counts as “active”; a booking made last month for a class this week does not — inverted from studio intent.
- **Proposed fix:** Join classes and filter on `classes.starts_at` in the last 30 days, or use attended check-ins in window.

- **Confidence:** High

---

### [HIGH] Class cancel does not notify members or refund credits

- **Location:** `src/routes/admin.schedule.tsx` ~774–814
- **Workflow affected:** Admin cancels class (single or bulk)
- **What's wrong:** Only sets `classes.is_cancelled = true`. Dialog text says “Existing bookings may need follow-up” but no code loads bookings, sends email, or calls `cancelBookingWithPolicy`.
- **Why it breaks:** Customers keep confirmed bookings for a cancelled class; credits stay deducted; no notification.
- **Proposed fix:** After cancel, fetch non-cancelled bookings for those class IDs and loop `cancelBookingWithPolicy({ cancellationReason: 'admin_cancelled' })` + class-cancel email template.

- **Confidence:** High

---

### [HIGH] Booking credit trigger ignores expiry and class-type eligibility

- **Location:** `supabase/migrations/20260520120000_booking_credit_deduct_once.sql` ~42–63
- **Workflow affected:** Book a class with credits
- **What's wrong:** `deduct_credit_on_booking_insert` checks `credit_id`, ownership, unlimited, and `credits_remaining >= 1` but **not** `expires_at > now()` or `allowed_class_types` vs class type.
- **Why it breaks:** Client filters in `BookingSheet.tsx` ~148–167 can be bypassed (stale UI, admin walk-in, API tampering). Expired or wrong-type credits can still deduct if referenced by `credit_id`.
- **Proposed fix:** In the trigger, join `classes` on `new.class_id` and reject when `cred.expires_at <= now()` or class type not allowed (mirror `userCreditCoversClassType` logic in SQL).

- **Confidence:** High

---

### [HIGH] May challenge upsert uses dropped unique constraint

- **Location:** `src/lib/mayChallengeCheckIn.ts` ~29–36; migration `supabase/migrations/20260506113000_booking_cancellation_and_challenge_limits.sql` ~18–19
- **Workflow affected:** QR check-in → May challenge stamp
- **What's wrong:** `upsert(..., { onConflict: "profile_id,class_date" })` but unique `(profile_id, class_date)` was **dropped** to allow 2 stamps/day.
- **Why it breaks:** Postgres `ON CONFLICT` requires a matching unique index → upsert fails at runtime (logged in `console.error`). Check-in path in `admin.check-in.tsx` ~242–246 relies on this helper.
- **Proposed fix:** Use plain `insert` and rely on the max-2-per-day trigger, or add a unique index on `(profile_id, class_date, booking_id)` and upsert on that.

- **Confidence:** High

---

### [HIGH] Customer/recipient lists ignore `secondary_roles`

- **Location:**
  - `src/lib/campaignRecipients.ts` ~37
  - `src/routes/admin.client-comms.tsx` ~255
  - `src/routes/admin.badges.tsx` ~161
  - `src/routes/admin.waivers.tsx` ~92
  - `src/routes/admin.index.tsx` ~95
- **Workflow affected:** Campaigns, waivers, badges, dashboard member count
- **What's wrong:** `.eq("role", "customer")` without `secondary_roles @> '{customer}'` or equivalent.
- **Why it breaks:** Staff with `secondary_roles: ['customer']` (director/guide Jeanae as customer) are excluded from broadcasts and counts.
- **Proposed fix:**

```tsx
.or("role.eq.customer,secondary_roles.cs.{customer}")
```

(PostgREST contains syntax for `text[]`.)

- **Confidence:** High

---

### [HIGH] May challenge written to wrong table on booking confirm

- **Location:** `src/components/BookingSheet.tsx` ~227–232
- **Workflow affected:** May challenge (“31 Days of Movement”)
- **What's wrong:** Inserts into `challenge_entries` on **booking confirm**. Home/challenge UI reads `challenge_checkins` (`src/lib/mayChallengeCheckIn.ts`, `src/routes/challenge.tsx` ~100).
- **Why it breaks:** Booking does not advance challenge progress; only check-in paths write `challenge_checkins`. Orphan rows in `challenge_entries`.
- **Proposed fix:** Remove `challenge_entries` insert from `BookingSheet`; keep stamp logic in `upsertMayChallengeCheckIn` on attend only.

- **Confidence:** High

---

### [MEDIUM] Home weekly goal uses browser-local week, not Africa/Johannesburg

- **Location:** `src/routes/index.tsx` ~133–167
- **Workflow affected:** Home → weekly goal progress
- **What's wrong:** `startOfWeekSunday(new Date())` from `src/lib/format.ts` uses local browser midnight/Sunday, then filters `checked_in_at` against that window.
- **Why it breaks:** Members near timezone boundaries (travel, wrong device TZ) get incorrect weekly counts vs studio week.
- **Proposed fix:** Use `jhbDayBounds` / studio TZ helpers (as check-in does) for week start/end ISO bounds.

- **Confidence:** Medium

---

### [MEDIUM] Admin Bookings week navigator uses local timezone

- **Location:** `src/routes/admin.bookings.tsx` ~250–297
- **Workflow affected:** Admin → Bookings week view
- **What's wrong:** `startOfCalendarWeekSunday(new Date())`, `startOfDay`, and class query `ws.toISOString()` / `we.toISOString()` are browser-local, unlike schedule/check-in which use JHB.
- **Why it breaks:** Classes near midnight JHB can appear on the wrong admin day; week strip misaligns with studio calendar.
- **Proposed fix:** Anchor week/day selection with `dayBoundsForDateKey` / `jhbDayBounds` from `@/lib/timezone` or `@/lib/jhbTime`.

- **Confidence:** Medium

---

### [MEDIUM] May challenge `class_date` derived from UTC, not studio TZ

- **Location:** `src/lib/mayChallengeCheckIn.ts` ~9–10; `src/lib/checkInRoster.ts` ~172; `src/routes/admin.bookings.tsx` ~511
- **Workflow affected:** May challenge stamp on check-in
- **What's wrong:** `new Date(startsAt).toISOString().split("T")[0]` yields **UTC** calendar date.
- **Why it breaks:** A 06:00 JHB class on 1 May is still 30 April UTC → stamp lands on wrong day for the challenge grid.
- **Proposed fix:**

```tsx
new Date(startsAt).toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" })
```

- **Confidence:** High for logic; Medium for how often it affects real class times

---

### [MEDIUM] Cancel booking does not refund Flow Points used at booking

- **Location:** `src/lib/bookingCancellation.ts` (entire function — no `flow_points_used` handling)
- **Workflow affected:** Customer/admin cancel booking paid with Flow Points
- **What's wrong:** Refunds `user_credits` when `credit_id` set; never restores `profiles.flow_points` when `payment_method === 'flow_points'`.
- **Why it breaks:** If CRITICAL fix #3 is applied, cancels still won't refund points unless added here.
- **Proposed fix:** On cancel, if `flow_points_used > 0`, increment `profiles.flow_points` (or insert compensating ledger row + RPC).

- **Confidence:** High (once flow-points payment is fixed)

---

### [MEDIUM] Customers “Has booking” includes cancelled bookings

- **Location:** `src/routes/admin.customers.tsx` ~391
- **Workflow affected:** Admin → Customers filters
- **What's wrong:** `supabase.from("bookings").select("profile_id")` with no status filter.
- **Why it breaks:** `hasBooking` chip stays true for members whose only bookings are cancelled.
- **Proposed fix:** `.neq("status", "cancelled")` or `.in("status", ["confirmed","attended"])`.

- **Confidence:** High

---

### [MEDIUM] Customers “Last visit” never populated

- **Location:** `src/routes/admin.customers.tsx` ~441 (`lastVisit: "—"` hardcoded)
- **Workflow affected:** Admin → Customers table
- **What's wrong:** Column always `"—"`; no query against `bookings.checked_in_at` or `mindbody_history`.
- **Why it breaks:** Jeanae cannot sort/filter by recency from this screen (UI suggests it should work).
- **Proposed fix:** Aggregate `max(checked_in_at)` or last `attended` booking per profile in `load()`.

- **Confidence:** High

---

### [MEDIUM] `sessionStorage` used for payment/idempotency (PWA fragility)

- **Location:**
  - `src/routes/payment.success.tsx` ~54–60, ~96–113, ~132, ~227
  - `src/lib/referral.ts` ~12–34
  - `src/components/ClassReviewPrompt.tsx` ~26–40
- **Workflow affected:** Purchase success, referrals, review prompts
- **What's wrong:** Dedup keys and referral codes stored in `sessionStorage`.
- **Why it breaks:** Cleared when PWA/tab closes → duplicate credit grants or duplicate RPC calls possible on return to success URL; referral loss on new session.
- **Proposed fix:** Prefer server-side idempotency (`yoco_payment_id`, checkout ID) or persist dedupe in DB; for referrals use URL param + profile column.

- **Confidence:** Medium (depends on user session patterns)

---

### [MEDIUM] `.single()` on inserts where zero rows is valid failure mode

- **Location:**
  - `src/components/BookingSheet.tsx` ~377, ~417 (class_invites)
  - `src/routes/admin.bookings.tsx` ~1031
  - `src/routes/admin.staff.tsx` ~316
- **Workflow affected:** Invite a friend; admin walk-in booking; staff create
- **What's wrong:** `.single()` throws PostgREST error when 0 rows (RLS block) vs `.maybeSingle()` returning null.
- **Why it breaks:** Harder-to-parse errors; inconsistent with booking insert path which correctly uses `.maybeSingle()`.
- **Proposed fix:** Replace with `.maybeSingle()` and handle `!row`.

- **Confidence:** Medium

---

### [MEDIUM] Challenge check-in uses plain `insert` in some paths (duplicate rows)

- **Location:** `src/lib/checkInRoster.ts` ~170–174; `src/routes/admin.bookings.tsx` ~509–513
- **Workflow affected:** Manual check-in from roster / bookings admin
- **What's wrong:** `insert` without upsert; QR path uses `upsertMayChallengeCheckIn` (which is itself broken — see HIGH above).
- **Why it breaks:** Re-marking attended or duplicate check-in attempts can create extra rows (up to 2/day limit) for the same booking.
- **Proposed fix:** Standardize on one helper with booking-id idempotency.

- **Confidence:** Medium

---

### [MEDIUM] Reports period bounds use browser local time

- **Location:** `src/routes/admin.reports.tsx` ~55–69, ~205–222
- **Workflow affected:** Admin → Reports (daily/weekly/monthly)
- **What's wrong:** `periodBounds` uses `startOfDay` / `startOfWeek` local; revenue query filters `user_credits.created_at` in that window (not `purchased_at`).
- **Why it breaks:** Misaligned with JHB business day; purchases recorded with `purchased_at` may fall outside revenue window.
- **Proposed fix:** JHB-normalized bounds; prefer `purchased_at` for revenue period filtering.

- **Confidence:** Medium

---

### [LOW] `class_definitions` table unused; catalog uses `studio_settings`

- **Location:** Schema lists `class_definitions`; `src/routes/admin.classes.tsx` reads `studio_settings.custom_class_types` + built-in slugs
- **Workflow affected:** Admin → Classes (type catalog)
- **What's wrong:** Two sources of truth; DB table never referenced in `src/`.
- **Why it breaks:** Risk of drift if rows are maintained in `class_definitions` but UI ignores them.
- **Proposed fix:** Either wire catalog to `class_definitions` or document deprecating the table.

- **Confidence:** High (static grep)

---

### [LOW] Debug logging left in guide loader

- **Location:** `src/lib/guidesForSelect.ts` ~60–75, ~103–137; `src/routes/admin.schedule.tsx` ~303–309
- **Workflow affected:** Admin schedule guide dropdown
- **What's wrong:** Verbose `console.log` / direct fallback query in production paths.
- **Why it breaks:** Noise in production consoles; minor perf hit.
- **Proposed fix:** Remove debug logs; keep error logging only.

- **Confidence:** High

---

### [LOW] `shift_swaps` — schema listed, no application code

- **Location:** No matches in `src/` for `shift_swaps`
- **Workflow affected:** Shift swaps (admin journey #15)
- **What's wrong:** Feature not implemented in frontend.
- **Why it breaks:** Staff cannot request swap shifts in-app.
- **Proposed fix:** Build UI or remove from expected workflows.

- **Confidence:** High (absence of code)

---

## Workflows verified OK (no defect filed)

| Workflow | Notes |
|----------|--------|
| Guide dropdowns (schedule) | `fetchGuidesForClassSelect` joins `guides` → `profiles` (`src/lib/guidesForSelect.ts`) |
| Guides admin page | Queries `guides` table (`src/routes/admin.guides.tsx`) |
| Check-in class day filter | Uses `jhbDayBounds()` (`src/routes/admin.check-in.tsx`) |
| Schedule class day filter | Uses `dayBoundsForDateKey` + studio TZ (`src/routes/schedule.tsx`) |
| Credit deduct once | DB trigger on insert; client no longer double-decrements (`20260520120000_booking_credit_deduct_once.sql`) |
| Unlimited credits at deduct | Trigger skips decrement when `is_unlimited` (`deduct_credit_on_booking_insert`) |
| Booking duplicate prevention | Handles `23505` on unique `(profile_id, class_id)` (`BookingSheet.tsx` ~338–340) |
| Cancel credit refund | Restores `credits_remaining` when not unlimited (`bookingCancellation.ts` ~124–143) |
| QR check-in RPC | Uses `check_in_booking_by_qr`; requires `status = confirmed` (correct) |
| Assign package failure logging | Logs profile id + name per failure (`AssignPackageDialog.tsx` ~82–107, ~109–117) |
| Marketing financial block | `adminMarketingAccess.ts` blocks timesheets/payouts/transactions/reports |

---

## Could not verify statically — needs manual test

1. **`booked_count` on production DB** — Confirm whether a trigger exists in hosted Supabase outside this repo’s migrations. If yes, severity of issue #1 may drop; if no, overbooking is live.

2. **`user_credits.price_zar`** — Run `\d user_credits` in Supabase; if column exists in prod but not in ground-truth doc, adjust reports fix.

3. **Email verification gate** — `auth.tsx` allows immediate session → onboarding when Supabase returns a session on sign-up (~149–151). Confirm Supabase Auth “Confirm email” setting; test sign-up → verify inbox → first login.

4. **Promo code at Yoco checkout** — Client validates promos on `pricing.tsx` (~366–416); edge function enforcement not audited (per scope: do not modify `supabase/functions/`). Test percentage/fixed, `applies_to` yoga/wellzone/all, max uses, expiry.

5. **RLS on `bookings` insert** — Booking failure toast mentions RLS (~345); test customer vs staff booking same class.

6. **Class invite paid flow** — `finalize-class-invite` + Yoco after `BookingSheet` pay-for-friend (~399–450).

7. **Walk-in booking on admin Bookings** — Creates booking + check-in; verify credit deduct and `booked_count`.

8. **Leave request end-to-end with fixed RLS** — Staff submit → management approve → email to staff; sick-note signed URL expiry.

9. **PWA `sessionStorage` dedupe** — Complete purchase, force-close app, reopen success URL — check for duplicate credits.

10. **Director Jeanae in guide dropdown** — Confirm `guides` row exists for her `profile_id` and appears in schedule edit modal.

11. **Flow Points balance after check-in** — Attend class; confirm +10 once on `profiles.flow_points`, not +1 ledger +10 profile.

12. **Cancel class with 5 bookings** — After fix, confirm 5 emails and credit refunds.

13. **All Access + Pilates booking** — Recent fix via `userCreditCoversClassType`; regression-test in app.

14. **Marketing role** — Access all non-financial admin routes; blocked URLs redirect to `/admin`.

15. **BOH timesheet clock in/out** — `admin.timesheets.tsx` shift_date migration alignment with real shifts.

16. **WhatsApp admin page** — Template/send flows (if wired to Meta/Twilio in prod).

17. **`challenge_checkins` upsert error** — Scan browser console on QR check-in during May; confirm whether upsert errors appear today.

---

*End of audit report. No code was modified.*
