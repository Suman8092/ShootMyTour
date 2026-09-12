# Architecture and invariants

## Request path

Browser → same-origin Node HTTP server → role/ownership + CSRF validation → SQL transaction / provider adapter → JSON → React state.

The application is a single-node, persistent-disk local MVP. Native Node modules serve HTTP, crypto and SQLite. There are no server runtime npm dependencies. React and ReactDOM are already bundled into public/app.js. Browser forms call real API endpoints; data is not stored as a fake in-memory UI array.

## Data representation

- IDs: UUIDs for new entities; predictable IDs only for explicitly fictional seed records.
- Time: canonical UTC ISO text in the database; UI shows Asia/Kolkata (IST). Availability inputs add +05:30 explicitly.
- Money: integer paise, currency INR. No floating-point payment amounts.
- Package snapshot: title, duration, edited photos, delivery days and price copied into booking.
- Commission: percentage validated in settings, calculated when booking is created and snapshotted in paise.
- Passwords: random salt and scrypt KDF; timing-safe comparison.
- Sessions/reset tokens: random opaque tokens; their SHA-256 digest is stored, never plaintext session/reset tokens.

## Reservation consistency

SQLite uses WAL, foreign keys, busy timeout and BEGIN IMMEDIATE for booking creation and settlement. The transaction rechecks provider/package/city activity, duration, coupon capacity and conflicting bookings before inserting the hold. Eight concurrent booking attempts for an already held interval are covered by the integration tests.

Active statuses are PENDING_PHOTOGRAPHER_CONFIRMATION, CONFIRMED and COMPLETED, plus PENDING_PAYMENT with an unexpired hold. Intervals are treated as [start,end), so adjacent intervals are not overlapping. Slot overlap insert/update triggers prevent conflicting photographer availability windows.

The provider network request is not made while holding a database transaction. A pending payment row reserves order creation; subsequent requests reuse an existing order or ask the client to retry. A process crash during order creation can leave a pending row with no order ID: reconcile that row rather than guessing that no remote order exists.

For true horizontal scale, move to PostgreSQL and enforce database-level booking exclusion constraints. Do not put the SQLite WAL file on NFS or run independent instances with separate databases.

## Settlement invariants

- Browser success alone is never trusted for Razorpay.
- HMAC uses server-stored order ID and the reported gateway payment ID.
- Provider lookup checks captured status, amount, currency and order ownership.
- Signed webhooks are verified over the original raw bytes.
- Stable event IDs prevent already-processed event replay.
- Successful settlement has a single-success-payment constraint and repeats are idempotent.
- Late payment cannot steal an interval held by a newer customer; it goes to refund review.
- Refund request and refund completion are different records/states.
- An uncertain refund request stays pending and needs gateway reconciliation to avoid duplicate refunds.

The implementation does not yet have a complete reconciliation worker for every out-of-order event, provider outage, second distinct capture or operational recovery. These cases are launch blockers for unattended live operation.

## Authorization

Public requests see only active approved photographers and approved media/packages. Every mutation checks role; booking reads, messages, payment and delivery additionally check ownership. Unapproved local image URLs require owner/admin session access and are not publicly cached. Super admins cannot deactivate themselves through the UI. Role changes, account deactivation and password resets revoke sessions.

Non-GET browser writes require the configured Origin. Authenticated writes also require a session CSRF token. Cookies are HttpOnly and SameSite=Lax; Secure is added in production. Auth/reset endpoints are rate limited in process. A distributed rate-limit store and reverse-proxy configuration are still needed for production.

## Email and audit

Notification rows and email-outbox rows persist in the database. A 30-second worker sends pending email through Resend when configured, with a stable idempotency key and a maximum of five attempts. Failed exhausted messages require operator review. Audit logs record booking state changes and most administrative operations, including manual payout recording. Logs are operational, not tamper-evident compliance audit storage.

## Deployment boundaries

Static UI files are served by the same Node process. Keep the process behind TLS, use one persistent volume and deploy with a clean database. The default listener and Compose port mapping are loopback-only. Development/demo settings must not be exposed publicly. Production mode requires HTTPS APP_URL, Razorpay configuration and no seeded demo admin.
