# API reference — delivered endpoints

All amounts use integer paise. All date/time values are ISO strings. Mutating requests require Origin equal to APP_URL. Authenticated writes also require X-CSRF-Token from login or /api/auth/me. Use the HttpOnly session cookie; do not put auth tokens in localStorage.

## Public and account

- GET /api/config — demo/payment mode, support email.
- GET /api/auth/me — safe user fields and session CSRF token.
- POST /api/auth/register — name, email, password, optional phone; customer role only.
- POST /api/auth/register-photographer — above plus city_id and experience; photographer role only.
- POST /api/auth/login — email, password.
- POST /api/auth/logout.
- POST /api/auth/forgot-password — email; response does not disclose account existence.
- POST /api/auth/reset-password — token, password (10+ characters).
- PATCH /api/profile — own name, optional phone.
- GET /api/cities and /api/cities/:slug.
- GET /api/photographers — city, search, category, rating, price (whole INR ceiling), duration (minutes), date (IST calendar date), sort, page.
- GET /api/photographers/:id — full public profile, packages, portfolio, reviews and available slots.
- GET /api/photographers/:id/packages, /availability, /reviews.

## Customer / booking participants

- POST /api/bookings — package_id, slot_id, location, people, shoot_type, notes, optional coupon. Server ignores any client-supplied amount.
- GET /api/bookings/my.
- GET /api/bookings/:id — owner/assigned photographer/admin only; details, payments, refunds, messages and audit timeline.
- PATCH /api/bookings/:id/cancel — customer/admin; valid pre-completion stages only.
- POST /api/bookings/:id/messages — message; booking participants/admin only.
- POST /api/payments/create-order — booking_id; customer owner only.
- POST /api/payments/demo — payment_id, outcome=success or failed; local DEMO gateway only.
- POST /api/payments/verify — razorpay_order_id, razorpay_payment_id, razorpay_signature.
- POST /api/webhooks/razorpay — raw provider JSON + signed headers, no browser session needed.
- POST /api/reviews — booking_id, rating, optional comment.
- GET /api/notifications; PATCH /api/notifications/read.

## Photographer

- GET /api/photographer/workspace — own profile, packages, slots, portfolio, bookings, reviews and payouts.
- PATCH /api/photographer/profile — city_id, bio, experience, languages, categories; resubmits for approval.
- POST /api/photographer/packages; PATCH /api/photographer/packages/:id — title, description, price in paise, duration in minutes, photos, delivery_days, active.
- DELETE /api/photographer/packages/:id — deactivates rather than deleting historic bookings.
- POST /api/photographer/availability; PATCH /api/photographer/availability/:id — start_at, end_at, blocked on update.
- DELETE /api/photographer/availability/:id — blocks an unreserved time window.
- POST /api/photographer/portfolio — data (base64 JPEG/PNG/WebP data URL), caption, category.
- PATCH /api/photographer/portfolio/:id — caption/category, resubmits moderation.
- DELETE /api/photographer/portfolio/:id.
- PATCH /api/photographer/bookings/:id/accept, /reject, /complete, /cancel — optional reason.
- PATCH /api/photographer/bookings/:id/deliver — url, HTTPS gallery only, completed booking only.

## Admin / super admin

- GET /api/admin/workspace — operational entities (latest 500 bookings and 200 audit entries).
- PATCH /api/admin/photographers/:id/verify, /reject; /feature with featured boolean.
- PATCH /api/admin/packages/:id/approve or /reject.
- PATCH /api/admin/portfolio/:id/approve or /reject.
- PATCH /api/admin/reviews/:id/hide or /show.
- PATCH /api/admin/users/:id — active; role changes restricted to super admin and USER/ADMIN transitions.
- POST /api/admin/cities; PATCH /api/admin/cities/:id — name, state, slug, active. DELETE deactivates.
- POST /api/admin/coupons — code, percent, max_discount (paise), usage_limit, expires.
- PATCH /api/admin/coupons/:id — active.
- PATCH /api/admin/settings — commission_percent and support_email; super admin only.
- PATCH /api/admin/bookings/:id/status — status + required note; constrained transitions, payment/conflict checks.
- POST /api/admin/payments/:id/refund — required reason; full-refund only, real financial side effect if Razorpay configured.
- POST /api/admin/payouts — booking_id, reference; records a completed external transfer, does not initiate one.
- GET /api/admin/dev-outbox — local demo admin only; full queued email contents for local testing.

Invalid inputs return JSON errors. Resource ownership failures return 403 or 404. Conflicting slots/state or duplicate data return 409. Authentication/reset attempt limits return 429. Production provider failures return a safe 502 message. The API is same-origin; arbitrary cross-origin clients are not enabled.
