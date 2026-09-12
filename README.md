# ShootMyTour — runnable full-stack MVP

A travel-photography marketplace built from your ShootMyTour Fullstack PRD: an editorial, responsive React interface backed by a real Node.js API and a persistent SQLite database.

**This is a runnable local MVP, not a claim that every item in the 32-page PRD is production-complete.** The booking engine, role-based workspaces and demo payment/refund workflows are implemented. External provider configuration, production hardening, approved legal policies and the PostgreSQL migration still require work. See `docs/PRD-COVERAGE.md` and `docs/LAUNCH-CHECKLIST.md` for the exact boundary.

## Run in 30 seconds

1. Install **Node.js 24 or later**. Check with `node --version`.
2. Extract the ZIP and open a terminal inside the `captureindia` folder.
3. Run:

```sh
npm start
```

4. Open **http://localhost:3000** in your browser.

**No `npm install`, database server, API key or internet connection is needed to run the bundled local demo.** The compiled React files are included. SQLite is built into Node 24; its experimental-feature warning is expected. On Windows, you can also run `start.bat`; on macOS/Linux use `sh start.sh`.

Use exactly `localhost:3000`, not `127.0.0.1:3000`, unless you also change `APP_URL`. The server validates the browser origin on writes.

### Demo sign-ins

All these LOCAL DEMO accounts use the password **`Capture@123`**:

| Workspace | Email |
| --- | --- |
| Customer | `customer@shootmytour.test` |
| Photographer — Jaipur | `photographer@shootmytour.test` |
| Photographer — Goa | `meera@shootmytour.test` |
| Photographer — Udaipur | `kabir@shootmytour.test` |
| Super admin | `admin@shootmytour.test` |

The login page includes buttons to fill these credentials. Do not use these accounts, fictional approvals or this shared password on a public deployment. Production startup refuses a database containing the seeded demo admin.

### Try the end-to-end flow

1. Sign in as the customer.
2. Browse photographers → choose Jaipur → open Aarav Studio.
3. Choose Gold, a future time and a location. Optionally apply `FIRSTFRAME`.
4. Continue to payment. Try the failed-payment simulator, then retry with successful demo payment.
5. The booking becomes **Pending photographer confirmation**, not automatically confirmed.
6. Sign out, sign in as `photographer@captureindia.test`, and open Bookings.
7. Accept the request. Sign in as the customer again to see the confirmed booking.
8. Send a booking message from either account. The thread persists in SQLite.
9. After the scheduled shoot end, the photographer can complete the shoot and deliver an HTTPS gallery link; the customer can leave one review.
10. Alternatively, cancel a paid booking. Sign in as admin → Payments → Refund, enter a reason and confirm. In demo mode the refund is simulated; no money moves.

**Completion intentionally cannot be forced before the shoot end from the UI.** The automated test suite uses an isolated test database to exercise completed-shoot, review and payout flows without changing your normal demo data.

## Included functionality

- Responsive homepage, city browsing, destination pages, filtered photographer listing, portfolio/profile pages, package selection and booking forms.
- Customer and photographer registration, login/logout, forgot/reset password and protected workspaces.
- Server-controlled roles: USER, PHOTOGRAPHER, ADMIN, SUPER_ADMIN.
- Photographer profile editing, package create/edit/deactivate, time-window creation/blocking and validated portfolio upload.
- Photographer, package, image and review moderation; city and user administration.
- Server-priced bookings with saved package/delivery/commission snapshots and optional coupons.
- Transactional ten-minute checkout reservations and overlap checks before accepting payment or booking confirmation.
- Payment attempts, demo success/failure, Razorpay order creation, server signature verification and signed-webhook processing.
- Customer cancellation, photographer acceptance/rejection/cancellation, completion and gallery-link delivery.
- Admin full-refund initiation and separate refund status; manual bank-transfer payout records.
- One review per completed booking; public ratings calculated from visible reviews.
- Private booking message threads; in-app notifications; persistent email outbox with an optional Resend sender.
- Admin operational reports, audit logs and commission/support settings.
- Draft policy pages, startup scripts, Docker local-demo configuration, backup and clean-admin utilities.

## Architecture

| Layer | This delivered build |
| --- | --- |
| Interface | React + TypeScript, bundled JavaScript/CSS supplied |
| Design | Custom responsive CSS, warm neutral / forest green editorial theme |
| API | Native Node.js HTTP, ES modules |
| Database | SQLite via `node:sqlite`, foreign keys, transactions, indexes and overlap triggers |
| Passwords | Salted scrypt (Node crypto), not plaintext |
| Sessions | Opaque tokens hashed in the database; HttpOnly SameSite cookie; CSRF token checks |
| Payment | Demo adapter by default; optional Razorpay REST + signed webhooks |
| Email | Persistent outbox; optional Resend API sender |
| Images | Local validated uploads; sample external stock-image URLs with offline typography fallback |

**Differences from the suggested PRD stack:** this is not a Next.js/Express/Prisma/PostgreSQL project. Package downloads were unavailable in the build environment. The runnable delivery uses React + native Node + SQLite rather than providing an untested dependency scaffold. The backend is JavaScript ES modules, not TypeScript. PostgreSQL/Prisma migration guidance is included; switching `DATABASE_URL` does not migrate this application.

## Project map

```text
captureindia/
  public/                 Precompiled browser app — served by Node
  src/app.tsx             Editable React/TypeScript interface
  src/styles.css          Responsive visual system
  server/app.mjs          API, access rules, payments, outbox worker, static server
  server/db.mjs           SQL schema, hashing helpers and fictional seed data
  scripts/                Build, clean-admin creation, reset and backup utilities
  tests/                  Executable isolated integration tests
  docs/                   Coverage, architecture, API and launch notes
  previews/               Selected design screenshots
  .env.example            Optional configuration template (no secrets)
  Dockerfile              Single-node container
  docker-compose.yml      Loopback-only demo container configuration
  start.bat / start.sh     Launch shortcuts
```

## Editing the UI

The bundled app runs offline, but rebuilding from source requires development packages. On a computer with npm network access:

```sh
npm install
npm run build
npm start
```

For backend restart-on-change use `npm run dev`. After changing `src/app.tsx` or `src/styles.css`, run `npm run build` and refresh the browser. `npm run dev` by itself does not rebuild frontend source.

Dependencies in `package.json` are pinned; no registry lockfile was fabricated. The supplied bundle was built with the packages available in the build environment. See `docs/BUILD-AND-TEST.md` for the actual bundled versions.

## Configuration

Copy `.env.example` to `.env` only when you need to change defaults. The server uses Node's environment-file support. Real environment variables take precedence.

### Razorpay — optional, requires your account

Set `PAYMENT_MODE=razorpay` and configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Use matching test keys while validating the integration. Set up automatic capture in your provider account if you want the included captured-payment flow; authorized-only payments do not confirm bookings.

Configure the webhook endpoint:

```text
https://YOUR_DOMAIN/api/webhooks/razorpay
```

Subscribe to `payment.captured`, `payment.failed` and `refund.processed`. Other events are authenticated and acknowledged without driving confirmation. The server checks signatures, order identity, currency and captured amount. The browser cannot mark a Razorpay payment successful by itself.

**No live Razorpay account was used or charged during this build. Provider-side test-mode and live acceptance are still required.** Refunds support the full captured amount only. Ambiguous refund timeouts stay pending to prevent an unsafe duplicate refund; reconcile them against the provider before taking further action.

### Email — optional

Set `RESEND_API_KEY` and `EMAIL_FROM` to a verified sender. The background outbox worker runs every 30 seconds and retries up to five times. It sends a stable idempotency key. Without these variables, emails remain queued and in-app notifications still work.

Local demo admins can inspect `/api/admin/dev-outbox` in an authenticated browser to see queued password-reset links. This endpoint is disabled outside demo mode. Outbox content is not printed into logs. A full scheduled retry/backoff/dead-letter operations console is not included.

### Images and galleries

Demo profiles use optional illustrative Unsplash URLs, not real photographer portfolios. If the internet is blocked, a typography-based destination fallback appears instead of a broken image. Image downloads were unavailable during build, so stock photography is not bundled.

Photographers can upload their own JPEG, PNG or WebP files (5 MB limit). Magic bytes are checked; filenames are randomized; approval is required for public access. Local uploads are not a substitute for a production image-processing pipeline: add safe decoding/re-encoding, metadata removal, size/pixel limits, object storage and CDN before launch. Gallery delivery stores an HTTPS link, not hosted full-resolution customer photo albums.

## Tests and data

```sh
npm test
npm run check
npm run backup
```

Tests use an isolated temporary database on port 3219; they do not erase or modify your local demo. Stop anything else using that test port before running them.

Your normal database and uploads persist under `data/`. Do not delete this folder unless you want to lose your application data. For a fresh demo with new future slots, stop the server and run:

```sh
npm run demo:reset -- --confirm
npm start
```

This deletes only the local demo database files; uploaded media remains. `npm run backup` creates a SQLite snapshot and copies uploads under `backups/`. Pause writes if you need a database/media-consistent snapshot, then encrypt and copy the backup off-host. Test your restore procedure.

## Before anyone pays real money

Read **`docs/LAUNCH-CHECKLIST.md`**. This local MVP is not a one-click, production-certified marketplace. In particular: configure a clean database and unique admin; replace fictional data and imagery; approve legal/tax/cancellation policies; test real providers; use persistent storage and TLS; perform independent security, accessibility and concurrency/load review; and complete the PostgreSQL migration if your launch architecture requires it.

## Troubleshooting

- **Unknown module `node:sqlite`:** use Node 24+, not Node 18/20.
- **Port in use:** change both `PORT` and `APP_URL` in `.env`.
- **Untrusted request origin:** open exactly the configured `APP_URL`. `localhost` and `127.0.0.1` are different origins.
- **Session expired / CSRF error:** reload and sign in again. Role changes, password resets and deactivation revoke sessions.
- **Blank screen after editing:** run `npm run build`; inspect the browser console and the server log.
- **No available slots:** seeded availability is relative to the first startup date. Add new availability as the photographer or reset the local demo.
- **Cannot complete a shoot:** wait until its scheduled end. This is an intentional business rule.
- **Photos are text panels:** external demo image URLs are unreachable. Upload approved real work; the rest of the app works offline.
- **Email never arrives:** configure a verified email provider or inspect the local demo outbox.
- **Payment is pending:** check the gateway event, amount and order ID; do not manually fabricate payment success.

## Hinglish quick start

ZIP extract karo → Node.js 24 install karo → project folder mein `npm start` chalao → browser mein `http://localhost:3000` kholo. Login page par Customer / Photographer / Admin demo shortcuts hain. Real payment ya email bhejne ke liye apni keys `.env` mein configure karni hongi. Yeh local runnable MVP hai; live launch se pehle checklist complete karna zaroori hai.
