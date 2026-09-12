# PRD coverage and decisions

This matrix distinguishes implemented behavior from planned integrations. It does not treat an empty route or a schema field as a finished feature.

## Implemented locally

| PRD area | Delivered behavior |
| --- | --- |
| Homepage | Responsive editorial layout, destination/date/occasion search, destination tiles, photographer cards, how-it-works, FAQ, join CTA. No fabricated testimonials or certificates. |
| Authentication | Customer/photographer signup, login/logout, non-enumerating reset request, expiring single-use reset tokens, session revocation. Email verification has a schema field only. |
| Roles | Guest, USER, PHOTOGRAPHER, ADMIN, SUPER_ADMIN; server checks and ownership checks. Only super admins can adjust customer/admin roles and settings. |
| Listing | City, search term, category, starting-price ceiling, minimum rating, package duration, available date; featured/price/rating sort and pagination. All public profiles must be approved and active. |
| Profile | Bio, city, languages, experience, approved portfolio, packages, available dates, visible reviews and booking CTA. Similar-photographer section not included. |
| Packages | Create/edit/deactivate, positive integer-paise pricing, minute duration, edited-photo count and delivery days; admin approval. Snapshot copied into each booking. |
| Availability | Date-specific windows, overlap trigger, future interval validation, blocking and conflict checks. One selectable start at the window start. Weekly recurrence and an admin slot-override UI are not included. |
| Booking | Ten-minute held checkout, no active overlapping intervals, location/notes/occasion/people, saved pricing, status log, role-owned detail screens. Draft is not a separate persistent stage. |
| Payments | Separate attempts, test success/failure, full-payment model. Razorpay order/signature/webhook code is implemented but not merchant-tested. Deposit/balance and Stripe are not implemented. |
| Refunds | Separate full-refund ledger, admin confirmation, captured-payment and eligible-booking checks, signed processed webhook. No partial/automatic policy-based refund engine. |
| Reviews | One per completed booking by its actual customer, integer rating 1–5, moderation and live aggregation of visible ratings. |
| Portfolio | Validated local JPEG/PNG/WebP upload, 5 MB limit, category/caption, moderation, protected unapproved assets and removal. No CDN/Cloudinary/S3 adapter or safe re-encoding pipeline. |
| Messaging | Persistent private booking thread accessible by participants/admin. No push/read receipts, attachments or real-time chat. |
| Notifications | In-app feed and read-all, durable email outbox, optional Resend worker with up to five retries. No WhatsApp/SMS. |
| Admin | Users, verification, city CRUD/deactivation, package/image/review moderation, bookings, payments, refunds, coupon management, settings and audit logs. |
| Payouts | Commission snapshot, eligible delivered/completed bookings, manual transfer reference recorded by admin. Does not move money or validate bank settlement. |
| Delivery | Photographer adds an external HTTPS gallery after completion; in-app/email-outbox updates. Customer file storage/download management is not included. |
| Reports | Basic operational counts, captured non-refunded amounts, completed-shoot commission, city booking totals. No conversion tracking, attribution, advanced analytics or exports. Latest 500 bookings are shown. |
| Policies | Terms/privacy/cancellation/photo-use/agreement route scaffolding. Explicitly marked drafts, not launch-approved legal policies. |
| Deployment | Bundled assets, native Node launch, optional container, environment sample, clean-admin script, backup script and checklists. No actual hosted deployment or TLS provisioning. |

## Deliberately deferred by the source PRD

AI recommendations, native mobile apps, real-time chat, subscriptions, automated split payouts, loyalty, multi-currency, international destinations, affiliate features and advanced analytics are not implemented.

## Important differences from the requested architecture

1. React TypeScript UI + native Node JavaScript API + SQLite, not Next.js/Express + Prisma/PostgreSQL.
2. Custom responsive CSS, not Tailwind/Framer Motion. Core interaction does not depend on animation.
3. Salted scrypt, not bcrypt/argon2. This is a real password KDF supplied by Node.
4. Local validated images, not cloud object storage.
5. Full-payment + manual acceptance is the one implemented booking model.
6. The SPA is noindexed until launch. Route-specific SSR metadata, canonical/OG tags, structured data, blog and production SEO still need implementation.
7. Public sample profiles are fictional and explicitly labeled. No real ratings or endorsements were fabricated.

## Booking state decisions

PENDING_PAYMENT → PENDING_PHOTOGRAPHER_CONFIRMATION → CONFIRMED → COMPLETED.

Expired checkout → PAYMENT_FAILED. Payment-attempt failure alone leaves an unexpired reservation available for retry. A captured payment after expiry/cancellation/conflict → REFUND_REQUESTED, never automatic confirmation. Customer cancellation, photographer rejection/cancellation and refund completion are recorded separately. Refund initiation never assumes that the gateway has completed the refund.

Completed bookings cannot be casually reverted by admin. Admin confirmation of unpaid bookings is intentionally not supported, even though the PRD allowed an audited override. This removes an unsafe shortcut until a real exception policy exists.
