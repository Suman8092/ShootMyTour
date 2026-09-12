# Production launch checklist — incomplete until verified

The bundle is ready to run locally. Do not interpret the following as completed launch work.

## Business and legal

- [ ] Set the operator legal identity, support/grievance contact and business address.
- [ ] Approve cancellation windows, weather/no-show, late-arrival and photographer-decline policies.
- [ ] Finalize personal/commercial usage rights, portfolio consent and guardian consent for minors.
- [ ] Finalize tax/GST treatment, invoices, commission, payout and dispute rules with qualified advisers.
- [ ] Replace all draft policy copy. Policy pages are not final legal advice.
- [ ] Onboard and verify real photographers; replace all fictional seed data and illustrative images.

## Infrastructure and identity

- [ ] Provision Node 24+, TLS, real domain, process supervision and persistent storage.
- [ ] Use a NEW DATA_DIR, DEMO_MODE=false, NODE_ENV=production and HTTPS APP_URL.
- [ ] Create a unique super admin with npm run admin:create using shell-provided ADMIN_EMAIL / ADMIN_PASSWORD. Never commit credentials.
- [ ] Confirm the demo database cannot start in production.
- [ ] Run behind a correctly configured reverse proxy. Add distributed auth rate limiting, admin MFA and monitoring.
- [ ] Add account verification, privacy export/deletion, retention controls and incident response.
- [ ] Decide whether the single-node SQLite architecture is acceptable for a constrained pilot; otherwise complete the PostgreSQL/Prisma migration before accepting real demand.
- [ ] Add safe image decoding/re-encoding, pixel-count limits, EXIF/PII stripping, object storage/CDN and storage quotas.
- [ ] Encrypt backups, copy them off-host and test a full restore. Verify consistency of DB and media.

## Payments and emails

- [ ] Configure matching Razorpay TEST keys, capture settings and signed public webhook endpoint.
- [ ] Test order creation, capture, authorization-only, invalid signatures, wrong amount/currency, duplicate and out-of-order events.
- [ ] Test payment after hold expiry, process restart mid-order, repeated distinct captures and reconciliation after provider timeouts.
- [ ] Test rejection/cancellation/refund end to end with the actual gateway; handle a refund webhook that arrives before its local mapping is committed.
- [ ] Implement and test reconciliation for unmatched events, orphan pending orders and refunds with uncertain results.
- [ ] Verify refund timing communications and payout eligibility with real accounting rules.
- [ ] Configure a verified email sender, SPF/DKIM/DMARC as required by your provider and deliverability monitoring.
- [ ] Add operational retry/backoff/dead-letter tooling and alerts for failed email jobs.
- [ ] Complete provider KYC/account approval before switching to live keys.

## Product and engineering acceptance

- [ ] Run npm test and the manual customer/photographer/admin flow.
- [ ] Run an independent security review, including authorization, CSRF/XSS, uploads and financial mutations.
- [ ] Test concurrent reservation creation across actual production processes and realistic traffic.
- [ ] Test low bandwidth, image sizes and load performance against the PRD targets; no performance SLA was certified here.
- [ ] Finish accessibility validation with keyboard and screen readers, including contrast and touch targets.
- [ ] Add explicit server pagination/filters and operational reports beyond the 500-booking local dashboard limit.
- [ ] Configure production SEO: route-specific server metadata, OG/canonical URLs, sitemap, structured data and remove demo noindex only when ready.
- [ ] Add dedicated support case ownership and resolution tracking if admins cannot operate through booking threads and the support inbox.

## Safe clean-admin bootstrap

Stop the server. Configure a clean data directory. Pass a unique password through your shell environment, run npm run admin:create, then clear the password variable. Start the server and add real cities/profiles. Use a secrets manager for live payment/email secrets. Do not seed demo data into this directory.

Docker Compose in this delivery is LOCAL DEMO ONLY. It does not configure a domain, TLS or production secrets.
