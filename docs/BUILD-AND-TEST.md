# Build and test record

## Executed here

- React/TypeScript source compiled with esbuild into public/app.js and public/app.css.
- Backend syntax checks using Node 24.14.1.
- 30 isolated Node integration tests: authentication, seed data, search, ownership, CSRF/origin rejection, role-injection prevention, booking pricing/coupons, concurrent reservation conflicts, payment failure/retry/idempotency, acceptance/completion, review ownership/uniqueness/moderation, message persistence, cancellation/refund separation, expired-hold late payment, availability conflict, profile approval, invalid upload signatures, notifications, session revocation, single-use reset tokens and static security headers.
- Local Chromium browser flow: customer login → reservation → simulated failure → successful demo payment → booking thread; photographer login → accept booking; customer/photographer/admin workspaces and mobile layouts traversed.
- Browser route snapshots and document-width checks at 1440px / 390px; visual QA used the artifact-design capture helper on a saved DOM snapshot, plus local Chromium snapshots for application states.

## Not executed here

- Live/test merchant Razorpay network calls, actual money movement, webhook delivery from Razorpay, Resend mail delivery.
- PostgreSQL/Prisma migrations (not implemented in this runtime).
- Third-party cloud image storage, real photographer onboarding, production KYC.
- Multi-instance production load, full penetration testing, accessibility certification or the PRD's performance SLA.
- Network package installation and registry lockfile generation were unavailable.

Read tests/integration.test.mjs for exact assertions. Test data uses temporary storage; a direct test-only database timestamp update allows completion logic to be exercised without waiting for a real shoot.

Do not treat these tests as a guarantee of production correctness. Complete LAUNCH-CHECKLIST.md and independent review before a public launch.
