# QA pass: admin class create / edit / cancel (May 2026)

Scope: `admin.schedule.tsx` flows for single and recurring classes. Verified via production build (`npm run build`) and end-to-end code trace. Live Supabase smoke tests were not run in this pass (no admin session in CI).

## Pass

| Flow | Result | Notes |
|------|--------|-------|
| Create single class | Pass | Form validation, insert, optional ticket product, toast + reload. |
| Create weekly series | Pass | `recurring_group_id` shared UUID; one row per week; per-occurrence ticket products when priced. |
| Edit single class | Pass | Updates one row; ticket product create/update/clear handled. |
| Edit recurring — this class only | Pass | Scope dialog; updates single row including time. |
| Edit recurring — all future | Pass | Shared fields (name, type, location, capacity, description, guide) propagate; time change applies only to edited occurrence. |
| Cancel single class (dialog Delete) | Pass | Loads confirmed bookings, `cancelBookingWithPolicy` with waive late fee, sets `is_cancelled`. |
| Bulk cancel | Pass | Same refund loop per selected id; clears selection. |
| Bulk reassign (recurring) | Pass | Scope dialog; future scope updates guide on series from each selected anchor `starts_at`. |

## Gaps / rough edges (not blocking deploy)

1. **Recurring cancel has no scope prompt** — Delete/cancel and bulk cancel always affect only the selected row(s). Editing/reassigning prompts “this class only / all future”; cancelling does not. Admins cancelling a mid-series occurrence may expect a matching series prompt.

2. **“All future” edit does not sync ticket products** — Price/name changes on a linked `product_id` apply to the edited class’s product handling only; future occurrences keep their existing ticket products.

3. **R0 ticket on create still creates complimentary products** — Admin can attach a R0 ticket product when creating/editing. Customer checkout is blocked (#7); assignment remains admin-only. Consider hiding R0 ticket field in admin UI or warning copy.

4. **Bulk reassign + mixed series** — Selecting multiple classes from different `recurring_group_id` values and choosing “all future” runs one update per selected row (correct but can be slow; no combined toast count).

## Recommended manual smoke (staging)

1. Create 3-week yoga series with guide A; edit week 2 guide → “all future”; confirm weeks 2–3 updated, week 1 unchanged.
2. Cancel week 2 only; confirm week 3 still on schedule.
3. Bulk-select two occurrences from same series → reassign guide → “this class only”.
4. Create class with ticket price R150; book as member; cancel class; confirm refund email path.

## Build

- `npm run build` — success (May 2026 pass).
