import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
const root = resolve(import.meta.dirname, ".."),
  dir = mkdtempSync(resolve(tmpdir(), "captureindia-test-")),
  port = 3219,
  origin = "http://localhost:" + port;
let proc, db, customer, photo, admin, second, profile, bookingId, paymentId;
function client() {
  return {
    cookie: "",
    csrf: "",
    async call(path, method = "GET", body) {
      const r = await fetch(origin + path, {
        method,
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          ...(this.cookie ? { Cookie: this.cookie } : {}),
          ...(this.csrf ? { "X-CSRF-Token": this.csrf } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const cookie = r.headers.get("set-cookie");
      if (cookie) this.cookie = cookie.split(";")[0];
      const data = await r.json();
      if (data.csrf) this.csrf = data.csrf;
      return { status: r.status, data };
    },
    async login(email) {
      const r = await this.call("/api/auth/login", "POST", {
        email,
        password: "Capture@123",
      });
      assert.equal(r.status, 200, JSON.stringify(r));
      return r;
    },
  };
}
const payload = (slot, extra = {}) => ({
  package_id: "photographer-1-gold",
  slot_id: slot,
  location: "Hawa Mahal entrance",
  people: 2,
  shoot_type: "Couple",
  notes: "Test booking",
  ...extra,
});
before(async () => {
  proc = spawn(process.execPath, ["server/app.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      APP_URL: origin,
      DATA_DIR: dir,
      DEMO_MODE: "true",
      PAYMENT_MODE: "demo",
      NODE_ENV: "test",
      RAZORPAY_KEY_ID: "",
      RAZORPAY_KEY_SECRET: "",
      RAZORPAY_WEBHOOK_SECRET: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  proc.stderr.on("data", (b) => (logs += b));
  for (let n = 0; n < 60; n++) {
    try {
      if ((await fetch(origin + "/api/config")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
    if (n === 59) throw Error("Server failed: " + logs);
  }
  db = new DatabaseSync(resolve(dir, "captureindia.sqlite"));
  customer = client();
  photo = client();
  admin = client();
  second = client();
  await customer.login("customer@shootmytour.test");
  await photo.login("photographer@shootmytour.test");
  await admin.login("admin@shootmytour.test");
  profile = (await customer.call("/api/photographers/photographer-1")).data;
});
after(async () => {
  db?.close();
  if (proc) {
    proc.kill("SIGTERM");
    await new Promise((r) => proc.once("exit", r));
  }
  rmSync(dir, { recursive: true, force: true });
});
test("1. Seed has ten cities, three approved photographers, nine packages and thirty slots", async () => {
  assert.equal((await customer.call("/api/cities")).data.length, 10);
  assert.equal((await customer.call("/api/photographers")).data.total, 3);
  assert.equal(profile.packages.length, 3);
  assert.equal(profile.slots.length, 10);
});
test("2. Public filtering returns selected city and empty matches safely", async () => {
  assert.equal(
    (await customer.call("/api/photographers?city=jaipur")).data.total,
    1,
  );
  assert.equal(
    (await customer.call("/api/photographers?city=jaipur&price=10")).data.total,
    0,
  );
});
test("3. Passwords are hashed and never included in account response", async () => {
  const r = await customer.call("/api/auth/me");
  assert.equal(r.data.user.role, "USER");
  assert.equal(r.data.user.password_hash, undefined);
  assert.notEqual(
    db.prepare("SELECT password_hash FROM users WHERE id='demo-customer'").get()
      .password_hash,
    "Capture@123",
  );
});
test("4. Guests and customers cannot read admin workspace", async () => {
  assert.equal((await client().call("/api/admin/workspace")).status, 401);
  assert.equal((await customer.call("/api/admin/workspace")).status, 403);
});
test("5. Forged origin and missing CSRF token are rejected", async () => {
  const r = await fetch(origin + "/api/profile", {
    method: "PATCH",
    headers: {
      Origin: "https://evil.example",
      "Content-Type": "application/json",
      Cookie: customer.cookie,
    },
    body: "{}",
  });
  assert.equal(r.status, 403);
  const s = await fetch(origin + "/api/profile", {
    method: "PATCH",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: customer.cookie,
    },
    body: "{}",
  });
  assert.equal(s.status, 403);
});
test("6. Signup cannot inject elevated role", async () => {
  const r = await second.call("/api/auth/register", "POST", {
    name: "Second Customer",
    email: "second@example.test",
    password: "Capture@123",
    role: "SUPER_ADMIN",
  });
  assert.equal(r.status, 200);
  const l = await second.login("second@example.test");
  assert.equal(l.data.user.role, "USER");
});
test("7. Invalid booking data and inactive packages are rejected", async () => {
  const bad = await customer.call(
    "/api/bookings",
    "POST",
    payload(profile.slots[0].id, { people: 0 }),
  );
  assert.equal(bad.status, 400);
  db.prepare(
    "UPDATE packages SET active=0 WHERE id='photographer-1-gold'",
  ).run();
  assert.equal(
    (await customer.call("/api/bookings", "POST", payload(profile.slots[0].id)))
      .status,
    400,
  );
  db.prepare(
    "UPDATE packages SET active=1 WHERE id='photographer-1-gold'",
  ).run();
});
test("8. Coupon discount, price and commission calculated on server", async () => {
  const r = await customer.call(
    "/api/bookings",
    "POST",
    payload(profile.slots[0].id, {
      coupon: "FIRSTFRAME",
      amount: 1,
      commission: 0,
    }),
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  bookingId = r.data.id;
  assert.equal(r.data.total, 350000);
  assert.equal(r.data.discount, 35000);
  assert.equal(r.data.amount, 315000);
  assert.equal(r.data.commission, 47250);
  assert.equal(r.data.status, "PENDING_PAYMENT");
});
test("9. Concurrent requests cannot reserve a held interval", async () => {
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      second.call("/api/bookings", "POST", payload(profile.slots[0].id)),
    ),
  );
  assert.ok(results.every((r) => r.status === 409));
  assert.equal(
    db
      .prepare("SELECT COUNT(*) n FROM bookings WHERE slot_id=?")
      .get(profile.slots[0].id).n,
    1,
  );
});
test("10. Another customer cannot view booking, chat or pay for it", async () => {
  assert.equal((await second.call("/api/bookings/" + bookingId)).status, 403);
  assert.equal(
    (
      await second.call("/api/bookings/" + bookingId + "/messages", "POST", {
        message: "intrusion",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await second.call("/api/payments/create-order", "POST", {
        booking_id: bookingId,
      })
    ).status,
    403,
  );
});
test("11. Photographer cannot accept without verified payment", async () => {
  assert.equal(
    (
      await photo.call(
        "/api/photographer/bookings/" + bookingId + "/accept",
        "PATCH",
      )
    ).status,
    409,
  );
});
test("12. Order creation is repeatable without duplicate pending orders", async () => {
  const p = await customer.call("/api/payments/create-order", "POST", {
    booking_id: bookingId,
  });
  assert.equal(p.status, 200);
  paymentId = p.data.id;
  const q = await customer.call("/api/payments/create-order", "POST", {
    booking_id: bookingId,
  });
  assert.equal(q.data.id, paymentId);
});
test("13. Failed test payment cannot confirm booking; retry creates another attempt", async () => {
  assert.equal(
    (
      await customer.call("/api/payments/demo", "POST", {
        payment_id: paymentId,
        outcome: "failed",
      })
    ).status,
    200,
  );
  assert.equal(
    (await customer.call("/api/bookings/" + bookingId)).data.status,
    "PENDING_PAYMENT",
  );
  const p = await customer.call("/api/payments/create-order", "POST", {
    booking_id: bookingId,
  });
  assert.notEqual(p.data.id, paymentId);
  paymentId = p.data.id;
});
test("14. Successful settlement is idempotent and awaits photographer", async () => {
  const r = await customer.call("/api/payments/demo", "POST", {
    payment_id: paymentId,
    outcome: "success",
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.status, "PENDING_PHOTOGRAPHER_CONFIRMATION");
  const a = await customer.call("/api/payments/demo", "POST", {
    payment_id: paymentId,
    outcome: "success",
  });
  assert.equal(a.status, 200);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) n FROM payments WHERE booking_id=? AND status='SUCCESS'",
      )
      .get(bookingId).n,
    1,
  );
});
test("15. Photographer accepts paid booking; future completion is rejected", async () => {
  assert.equal(
    (
      await photo.call(
        "/api/photographer/bookings/" + bookingId + "/accept",
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await photo.call(
        "/api/photographer/bookings/" + bookingId + "/complete",
        "PATCH",
      )
    ).status,
    409,
  );
});
test("16. Customer cannot review an uncompleted booking", async () => {
  assert.equal(
    (
      await customer.call("/api/reviews", "POST", {
        booking_id: bookingId,
        rating: 5,
        comment: "too early",
      })
    ).status,
    403,
  );
});
test("17. Booking thread persists text without executing HTML", async () => {
  const message = "<script>alert(1)</script>";
  assert.equal(
    (
      await customer.call("/api/bookings/" + bookingId + "/messages", "POST", {
        message,
      })
    ).status,
    200,
  );
  assert.equal(
    (await photo.call("/api/bookings/" + bookingId)).data.messages[0].message,
    message,
  );
});
test("18. Completed past shoot allows delivery, exactly one review and payout", async () => {
  db.prepare("UPDATE bookings SET start_at=?,end_at=? WHERE id=?").run(
    new Date(Date.now() - 7200000).toISOString(),
    new Date(Date.now() - 3600000).toISOString(),
    bookingId,
  );
  assert.equal(
    (
      await photo.call(
        "/api/photographer/bookings/" + bookingId + "/complete",
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await photo.call(
        "/api/photographer/bookings/" + bookingId + "/deliver",
        "PATCH",
        { url: "javascript:alert(1)" },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await photo.call(
        "/api/photographer/bookings/" + bookingId + "/deliver",
        "PATCH",
        { url: "https://example.com/private-gallery" },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await customer.call("/api/reviews", "POST", {
        booking_id: bookingId,
        rating: 5,
        comment: "Great demo experience",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await customer.call("/api/reviews", "POST", {
        booking_id: bookingId,
        rating: 4,
      })
    ).status,
    409,
  );
  assert.equal(
    (await customer.call("/api/photographers/photographer-1")).data.rating,
    5,
  );
  assert.equal(
    (
      await admin.call("/api/admin/payouts", "POST", {
        booking_id: bookingId,
        reference: "TEST-UTR-1",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await admin.call("/api/admin/payouts", "POST", {
        booking_id: bookingId,
        reference: "TEST-UTR-2",
      })
    ).status,
    409,
  );
});
test("19. Moderation removes hidden reviews from public rating", async () => {
  const review = db
    .prepare("SELECT id FROM reviews WHERE booking_id=?")
    .get(bookingId);
  assert.equal(
    (await admin.call("/api/admin/reviews/" + review.id + "/hide", "PATCH"))
      .status,
    200,
  );
  assert.equal(
    (await customer.call("/api/photographers/photographer-1")).data
      .review_count,
    0,
  );
});
test("20. Paid cancellation is separate from refund; admin can refund once", async () => {
  const r = await customer.call(
    "/api/bookings",
    "POST",
    payload(profile.slots[1].id),
  );
  assert.equal(r.status, 200);
  const bid = r.data.id,
    p = await customer.call("/api/payments/create-order", "POST", {
      booking_id: bid,
    });
  await customer.call("/api/payments/demo", "POST", { payment_id: p.data.id });
  assert.equal(
    (await customer.call("/api/bookings/" + bid + "/cancel", "PATCH")).status,
    200,
  );
  assert.equal(
    (await customer.call("/api/bookings/" + bid)).data.payments[0].status,
    "SUCCESS",
  );
  assert.equal(
    (
      await admin.call("/api/admin/payments/" + p.data.id + "/refund", "POST", {
        reason: "Full demo refund approved",
      })
    ).status,
    200,
  );
  assert.equal(
    (await customer.call("/api/bookings/" + bid)).data.status,
    "REFUNDED",
  );
  assert.equal(
    (
      await admin.call("/api/admin/payments/" + p.data.id + "/refund", "POST", {
        reason: "Again",
      })
    ).status,
    409,
  );
});
test("21. Expired reservation accepts late payment only into refund review, never confirmation", async () => {
  const r = await customer.call(
    "/api/bookings",
    "POST",
    payload(profile.slots[2].id),
  );
  const bid = r.data.id,
    p = await customer.call("/api/payments/create-order", "POST", {
      booking_id: bid,
    });
  db.prepare("UPDATE bookings SET hold_until=? WHERE id=?").run(
    Date.now() - 1000,
    bid,
  );
  const newBooking = await second.call(
    "/api/bookings",
    "POST",
    payload(profile.slots[2].id),
  );
  assert.equal(newBooking.status, 200);
  const late = await customer.call("/api/payments/demo", "POST", {
    payment_id: p.data.id,
  });
  assert.equal(late.data.status, "REFUND_REQUESTED");
  assert.equal(
    (await second.call("/api/bookings/" + newBooking.data.id)).data.status,
    "PENDING_PAYMENT",
  );
});
test("22. Availability overlap is rejected; booked windows cannot be blocked", async () => {
  const existing = profile.slots[2];
  assert.equal(
    (
      await photo.call("/api/photographer/availability", "POST", {
        start_at: existing.start_at,
        end_at: existing.end_at,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await photo.call(
        "/api/photographer/availability/" + existing.id,
        "DELETE",
      )
    ).status,
    409,
  );
});
test("23. Another photographer cannot edit a package they do not own", async () => {
  const other = client();
  await other.login("meera@shootmytour.test");
  assert.equal(
    (
      await other.call(
        "/api/photographer/packages/photographer-1-gold",
        "PATCH",
        {
          title: "Steal",
          price: 100,
          duration: 60,
          photos: 20,
          delivery_days: 7,
        },
      )
    ).status,
    404,
  );
});
test("24. Pending photographer hidden from public discovery until approved", async () => {
  const newbie = client();
  let r = await newbie.call("/api/auth/register-photographer", "POST", {
    name: "New Photographer",
    email: "new@example.test",
    password: "Capture@123",
    city_id: "jaipur",
    experience: 3,
  });
  assert.equal(r.status, 200);
  await newbie.login("new@example.test");
  const ws = (await newbie.call("/api/photographer/workspace")).data;
  assert.equal(
    (await customer.call("/api/photographers/" + ws.profile.id)).status,
    404,
  );
  await admin.call(
    "/api/admin/photographers/" + ws.profile.id + "/verify",
    "PATCH",
  );
  assert.equal(
    (await customer.call("/api/photographers/" + ws.profile.id)).status,
    200,
  );
});
test("25. Portfolio rejects mismatched file signatures and executable image types", async () => {
  assert.equal(
    (
      await photo.call("/api/photographer/portfolio", "POST", {
        data: "data:image/jpeg;base64,aGVsbG8=",
        caption: "bad",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await photo.call("/api/photographer/portfolio", "POST", {
        data: "data:image/svg+xml;base64,PHN2Zz4=",
        caption: "bad",
      })
    ).status,
    400,
  );
});
test("26. Notifications and audit logs are persisted", async () => {
  assert.ok((await customer.call("/api/notifications")).data.length >= 3);
  const r = await customer.call("/api/bookings/" + bookingId);
  assert.ok(r.data.logs.some((l) => l.new_status === "CONFIRMED"));
  assert.ok(r.data.logs.some((l) => l.new_status === "COMPLETED"));
});
test("27. Admin can deactivate account and invalidate its session", async () => {
  const uid = (await second.call("/api/auth/me")).data.user.id;
  assert.equal(
    (await admin.call("/api/admin/users/" + uid, "PATCH", { active: false }))
      .status,
    200,
  );
  assert.equal((await second.call("/api/bookings/my")).status, 401);
});
test("28. Password reset is non-enumerating, single-use and revokes sessions", async () => {
  const guest = client();
  const r = await guest.call("/api/auth/forgot-password", "POST", {
    email: "customer@shootmytour.test",
  });
  assert.equal(r.status, 200);
  const unknown = await guest.call("/api/auth/forgot-password", "POST", {
    email: "unknown@example.test",
  });
  assert.deepEqual(r.data, unknown.data);
  const mail = db
    .prepare(
      "SELECT body FROM email_outbox WHERE subject='Reset your ShootMyTour password' ORDER BY created_at DESC LIMIT 1",
    )
    .get();
  const token = new URL(mail.body).searchParams.get("token");
  assert.equal(
    (
      await guest.call("/api/auth/reset-password", "POST", {
        token,
        password: "NewCapture@456",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await guest.call("/api/auth/reset-password", "POST", {
        token,
        password: "NewCapture@456",
      })
    ).status,
    400,
  );
  assert.equal((await customer.call("/api/bookings/my")).status, 401);
});
test("29. Static security headers and SPA deep links are available", async () => {
  const r = await fetch(origin + "/photographers/photographer-1");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-security-policy"), /object-src 'none'/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.match(await r.text(), /ShootMyTour/);
  assert.equal((await fetch(origin + "/.env")).status, 404);
});
test("30. Demo webhook is disabled and admin self-deactivation is blocked", async () => {
  assert.equal(
    (await client().call("/api/webhooks/razorpay", "POST", {})).status,
    404,
  );
  assert.equal(
    (
      await admin.call("/api/admin/users/demo-admin", "PATCH", {
        active: false,
      })
    ).status,
    400,
  );
});
