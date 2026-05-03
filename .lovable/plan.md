## Goal

Make the admin dashboard fully responsive (mobile + tablet + desktop) and build the **Check-In** and **Bookings** pages into proper, usable tools rather than placeholders.

---

## 1. Responsive Admin Shell

Currently `AdminShell` always renders a sidebar (w-56 / w-16) glued to the left, which breaks on mobile and is cramped on tablet.

Changes to `src/components/admin/AdminShell.tsx` and `AdminNav.tsx`:

- **Mobile (<768px):** sidebar hidden by default, opens as an off-canvas drawer (Sheet from `@/components/ui/sheet`) triggered by a hamburger button in the header. Header shows logo + current page title.
- **Tablet (768–1024px):** sidebar starts collapsed to icon-rail (w-16); user can expand.
- **Desktop (≥1024px):** current behavior (w-56 expanded by default, toggle to w-16).
- Header sticky on all sizes; main padding tightens on mobile (`px-4 py-5` vs `px-6 py-8`).
- Active route detection unchanged; tapping a nav item on mobile auto-closes the drawer.

Same pattern applied to all 20 admin pages automatically (they all render inside the shell).

`PageHeader` made responsive: title/description stack on mobile, actions wrap below instead of squeezing.

---

## 2. Check-In page (`/admin/check-in`)

Rebuild as a real day-of-class tool.

Layout:
- **Top:** session selector chips — list of today's classes (Sunrise Vinyasa 06:30, Sculpt 09:00, Slow Flow 17:30, Sauna Journey 18:30). Chip shows class name, time, attended/booked count (e.g. `4/12`). Selecting one filters the roster; "All today" chip shows everyone.
- **Search bar** — filters the visible roster by member name.
- **Roster list** — for each booking: avatar circle (initial), name, plan/credit, class & time. Right side: status pill + action button.
  - Booked → "Check in" button. Tapping flips to attended (green), records timestamp shown under the name.
  - Attended → "Undo" button.
  - No-show → muted, "Mark attended" option.
- **Walk-in modal** (Sheet): name input, pick today's class, pick credit source (drop-in / pack / add to bill). Adds to the roster as attended.
- **Right column on desktop / collapsible card on mobile:** QR code panel (same as today) + quick stats (checked-in today, capacity %).

Mobile: single column, session chips horizontally scroll, roster cards stack with action button full-width below name on <380px.

State stays local (mock); no backend wiring.

---

## 3. Bookings page (`/admin/bookings`)

Rebuild from a flat table to a proper management view.

Top toolbar:
- **Date range** selector: Today / Tomorrow / This week / All (chips).
- **Status filter** chips (all / booked / attended / cancelled / no-show) — kept.
- **Class filter** dropdown (all classes, or specific from `classRows`).
- **Search** by member name.
- **Export CSV** button (kept; generates from current filtered set client-side).
- Result counter on the right.

Results:
- **Desktop/tablet (≥768px):** table with columns Member, Class, When, Status, Credit, Actions. Actions = `…` menu with Cancel, Mark no-show, Move to another class (opens Sheet placeholder).
- **Mobile (<768px):** table replaced by stacked cards. Each card shows member name (bold), class + time, status pill, credit, and a "Manage" button opening a Sheet with the same actions.

Add a **detail Sheet** (opens on row/card click) showing member name, contact, plan, full booking history (filtered from `bookingRows`), and the action buttons.

Empty state when filters return nothing: friendly message + "Clear filters" button.

State stays local (mock); status changes update an in-memory map so the UI reflects them immediately.

---

## Technical notes

- New shared component `src/components/admin/AdminMobileNav.tsx` wrapping the nav inside a Sheet for the mobile drawer.
- `AdminShell` uses Tailwind responsive classes (`md:`, `lg:`) — no JS media queries.
- Sheet, Input, Select, DropdownMenu, Avatar shadcn components — already in the project.
- `bookingRows` extended slightly in `adminMock.ts` (more entries for Today, plus a couple Tomorrow/This week) so filters feel populated.
- No new routes; only the two existing files (`admin.check-in.tsx`, `admin.bookings.tsx`) plus `AdminShell.tsx`, `AdminNav.tsx`, `PageHeader.tsx`, and a new `AdminMobileNav.tsx`.

---

## Files touched

- edit `src/components/admin/AdminShell.tsx`
- edit `src/components/admin/AdminNav.tsx` (accept onNavigate callback to close drawer)
- edit `src/components/admin/PageHeader.tsx` (responsive layout)
- create `src/components/admin/AdminMobileNav.tsx`
- rewrite `src/routes/admin.check-in.tsx`
- rewrite `src/routes/admin.bookings.tsx`
- edit `src/data/adminMock.ts` (add a few more booking rows for richer filtering)
