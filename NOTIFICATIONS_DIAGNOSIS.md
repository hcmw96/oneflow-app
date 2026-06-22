# Notifications / booking confirmation — diagnosis (2026-05-22)

## `send-email` edge function

| Check | Result |
|-------|--------|
| Source in repo | **Yes** — `supabase/functions/send-email/index.ts` |
| Bundled assets | `oneflow-logo.png`, `config.toml` (`verify_jwt = true`) |
| Email provider | **Resend** (`RESEND_API_KEY`), **not SendGrid** |
| From address | `One Flow <noreply@oneflow.co.za>` |
| Missing env in function | Returns HTTP 500 `{ "error": "Missing RESEND_API_KEY" }` |

If you were looking for `SENDGRID_API_KEY` in Supabase secrets, it will not be used by this codebase. The required secret name is **`RESEND_API_KEY`**.

Optional: `PUBLIC_APP_URL` or `SITE_URL` (logo fallback URL in emails).

## Deployment

| Check | Result (verified 2026-05-22 via `supabase functions list`) |
|-------|----------------------------------------------------------------|
| `send-email` deployed | **Yes** — ACTIVE, version 4 |
| `RESEND_API_KEY` secret | **Yes** — present in project secrets (no `SENDGRID_*` secret) |

Deployment status on other environments must still be confirmed separately if you use more than one Supabase project.

## Booking confirmation flow

After a successful booking insert, `BookingSheet.tsx` calls:

```ts
supabase.functions.invoke("send-email", {
  body: { to, template: "booking_confirmation_class" | "booking_confirmation_sauna", data: { ... } },
});
```

`afterBookingConfirmed` now logs to the browser console:

- skip when the member has no email on their auth/profile
- invoke start (`template`, `to`, `bookingId`)
- invoke transport error (network / function not deployed / JWT)
- function JSON error (e.g. missing `RESEND_API_KEY`, Resend API rejection)
- success with Resend message id when returned

Walk-ins and other flows (`WalkInSheet`, `bookingCancellation`, waitlist promote, etc.) use the same `send-email` function.

## Likely failure modes (fix before code changes)

1. **`RESEND_API_KEY` not set** in Supabase Edge Function secrets.
2. **`send-email` not deployed** (or stale) on the hosted project.
3. **Resend domain** — `noreply@oneflow.co.za` must be verified in Resend; unverified domains cause API errors returned in the function response.
4. **JWT** — `verify_jwt = true`; client `invoke` must send the user session (default for `supabase.functions.invoke` when logged in). Booking confirmation runs as the member, so they must be authenticated.
5. **No email on user** — confirmation is skipped silently (now logged as a warning).

## What is not missing in code

- Template builders for class/sauna confirmation exist in `send-email/index.ts`.
- Client payload helpers exist in `src/lib/bookingConfirmationEmail.ts`.

## Recommended next steps (ops, not implemented here)

1. Set `RESEND_API_KEY` in Supabase → Project Settings → Edge Functions → Secrets.
2. Deploy: `supabase functions deploy send-email`.
3. Book a test class and inspect browser console for `[BookingSheet] send-email` logs.
4. If invoke succeeds but mail does not arrive, check Resend dashboard for bounces/blocks.
