# PostgreSQL / Prisma migration plan (not executed)

The shipped runtime uses SQLite. This document is a migration design, not an adapter, generated Prisma client or tested PostgreSQL deployment. Do not set DATABASE_URL and expect this app to use it.

## Preserve the correct model

The PRD's one-payment-per-booking schema cannot retain failed attempts and retries. Preserve a Booking → PaymentAttempt one-to-many relation, stable unique gateway order/payment IDs, a separate refund ledger, webhook-event deduplication, package snapshots, commission snapshots, message threads, reset/session tables, audit entries and a durable notification outbox.

Use UTC timestamptz values (not free-form time strings), integer/bigint paise for INR, and explicit enums/check constraints. Preserve one review per booking and one manual payout per booking. Never remove the payment/audit history when deactivating users, photographers or packages.

## Migration steps

1. Create Prisma models corresponding to docs/schema.sql. Rename fields deliberately and validate all relation/cardinality decisions.
2. Use additive reviewed SQL migrations for constraints Prisma cannot express, including interval exclusion constraints and partial unique indexes.
3. Add btree_gist and a database-level exclusion on photographer_id equality and tstzrange(start_at,end_at,'[)') overlap for active reservations. Track reservation_active explicitly; partial-index predicates cannot depend on volatile current time.
4. In a transaction, expire holds and mark their reservation_active false; lock relevant availability/provider rows; validate and insert the new reservation. Add bounded retries for serialization/exclusion conflicts.
5. Change synchronous SQL access to asynchronous Prisma/repository operations without holding a DB transaction open during gateway network calls.
6. Make payment settlement, webhook deduplication and outbox insertion atomic. Preserve immutable financial history and reconcile distinct extra captures instead of overwriting prior attempts.
7. Replace local image storage with signed object-storage access, media processing and CDN. Keep unapproved files private.
8. Add a durable worker for expiry, provider reconciliation, email retries and dispute/refund operations. Use distributed rate limiting and transactional outbox claims.
9. Import SQLite data in a maintenance window. Reconcile row counts, foreign keys, money totals and gateway references; validate constraints before switching traffic.
10. Re-run all API tests plus multi-instance concurrent booking, webhook replay, cancellation/refund race and backup/restore tests against the real Postgres service.

Do not ship the initial PRD schema unchanged and assume it prevents double bookings: an is_booked boolean plus ordinary reads is not a concurrency guarantee.
