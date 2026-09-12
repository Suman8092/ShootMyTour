import http from "node:http";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  randomBytes,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { seed, id, now, hash, check } from "./db.mjs";
import {
  initDb,
  get,
  all,
  run,
  tx,
  closeDb,
  isCloudPostgres,
} from "./db-adapter.mjs";
import { createClient } from "@insforge/sdk";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(resolve(ROOT, ".env.local"))) {
  try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
}
if (existsSync(resolve(ROOT, ".env"))) {
  try { process.loadEnvFile(resolve(ROOT, ".env")); } catch {}
}


let insforge = null;
if (
  process.env.INSFORGE_URL &&
  (process.env.INSFORGE_ANON_KEY || process.env.INSFORGE_API_KEY)
) {
  try {
    insforge = createClient({
      baseUrl: process.env.INSFORGE_URL,
      anonKey: process.env.INSFORGE_ANON_KEY || process.env.INSFORGE_API_KEY,
    });
  } catch (e) {
    console.warn("InsForge initialization failed:", e.message);
  }
}
const PORT = Number(process.env.PORT || 3000),
  HOST = process.env.HOST || "127.0.0.1";
if (!process.env.APP_URL) {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    process.env.APP_URL = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  } else if (process.env.VERCEL_URL) {
    process.env.APP_URL = `https://${process.env.VERCEL_URL}`;
  } else {
    process.env.APP_URL = "https://shoot-my-tour.vercel.app";
  }
}
const PROD = process.env.NODE_ENV === "production",
  DEMO = process.env.DEMO_MODE !== "false";
const ORIGIN = process.env.APP_URL || `http://localhost:${PORT}`;

const GATEWAY =
  process.env.PAYMENT_MODE === "razorpay" &&
  process.env.RAZORPAY_KEY_ID &&
  process.env.RAZORPAY_KEY_SECRET
    ? "RAZORPAY"
    : "DEMO";

const IS_SERVERLESS = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME,
);
const DATA = IS_SERVERLESS
  ? resolve("/tmp", "data")
  : resolve(ROOT, process.env.DATA_DIR || "data");

try {
  mkdirSync(DATA, { recursive: true });
  mkdirSync(resolve(DATA, "uploads"), { recursive: true });
} catch (e) {
  console.warn("Notice: could not create data dir:", e.message);
}

const dbInit = await initDb({
  databaseUrl: process.env.DATABASE_URL,
  driver: process.env.DATABASE_DRIVER,
  sqlitePath: resolve(DATA, "captureindia.sqlite"),
});

if (DEMO && !isCloudPostgres() && dbInit?.db) {
  try {
    seed(dbInit.db);
  } catch (e) {
    console.warn("Seed notice:", e.message);
  }
}
const digest = (x) => createHash("sha256").update(x).digest("hex");
const fail = (status, message) => {
  const e = Error(message);
  e.status = status;
  throw e;
};
const str = (v, label, max = 3000, required = true) => {
  if (typeof v !== "string" || v.length > max || (required && !v.trim()))
    fail(400, `Invalid ${label}`);
  return v.trim();
};
const num = (v, label, min = 0, max = 100000000) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < min || n > max)
    fail(400, `Invalid ${label}`);
  return n;
};
const date = (v) => {
  if (typeof v !== "string" || !Number.isFinite(Date.parse(v)))
    fail(400, "Invalid date");
  return new Date(v).toISOString();
};
const truth = (v) => (v === true || v === 1 ? 1 : 0);
const safeURL = (v) => {
  try {
    const u = new URL(v);
    if (u.protocol === "https:") return u.href;
  } catch {}
  fail(400, "Use a valid HTTPS URL");
};
async function log(
  actor,
  action,
  booking = null,
  old = null,
  status = null,
  note = "",
) {
  await run(
    "INSERT INTO audit_logs VALUES(?,?,?,?,?,?,?,?)",
    id(),
    booking,
    actor,
    action,
    old,
    status,
    note,
    now(),
  );
}
async function notify(user, title, message) {
  await run(
    "INSERT INTO notifications VALUES(?,?,?,?,0,?)",
    id(),
    user,
    title,
    message,
    now(),
  );
  await run(
    "INSERT INTO email_outbox(id,user_id,subject,body,created_at) VALUES(?,?,?,?,?)",
    id(),
    user,
    title,
    message,
    now(),
  );
  void emailWorker();
}
async function status(b, next, actor, note = "") {
  await run("UPDATE bookings SET status=?,hold_until=NULL WHERE id=?", next, b.id);
  await log(actor, "BOOKING_STATUS", b.id, b.status, next, note);
  await notify(
    b.user_id,
    "Booking update",
    `${b.package_title}: ${next.replaceAll("_", " ")}. ${note}`,
  );
  const p = await get(
    "SELECT user_id FROM photographers WHERE id=?",
    b.photographer_id,
  );
  if (p) {
    await notify(
      p.user_id,
      "Booking update",
      `${b.package_title}: ${next.replaceAll("_", " ")}.`,
    );
  }
}
async function expire() {
  const rows = await all(
    "SELECT * FROM bookings WHERE status='PENDING_PAYMENT' AND hold_until<?",
    Date.now(),
  );
  for (const b of rows)
    await status(
      b,
      "PAYMENT_FAILED",
      null,
      "Checkout reservation expired. Please create a new booking.",
    );
}
async function overlapping(pid, start, end, exclude = "") {
  return await get(
    `SELECT id FROM bookings WHERE photographer_id=? AND id!=? AND start_at<? AND end_at>? AND (status IN ('PENDING_PHOTOGRAPHER_CONFIRMATION','CONFIRMED','COMPLETED') OR (status='PENDING_PAYMENT' AND hold_until>?)) LIMIT 1`,
    pid,
    exclude,
    end,
    start,
    Date.now(),
  );
}
const rates = new Map();
function limit(key, maximum = 15) {
  const time = Date.now();
  let r = rates.get(key);
  if (!r || r.until < time) {
    r = { count: 0, until: time + 900000 };
    rates.set(key, r);
  }
  if (++r.count > maximum)
    fail(429, "Too many attempts. Please try again in 15 minutes.");
  if (rates.size > 10000)
    for (const [k, v] of rates) if (v.until < time) rates.delete(k);
}
const isAdmin = (u) => u && ["ADMIN", "SUPER_ADMIN"].includes(u.role);
function auth(u, roles) {
  if (!u) fail(401, "Please sign in");
  if (roles && !roles.includes(u.role)) fail(403, "Access denied");
  return u;
}
const admin = (u) => {
  auth(u);
  if (!isAdmin(u)) fail(403, "Admin access required");
  return u;
};
async function photographer(u) {
  auth(u, ["PHOTOGRAPHER"]);
  return (
    (await get("SELECT * FROM photographers WHERE user_id=?", u.id)) ||
    fail(404, "Photographer profile missing")
  );
}
async function booking(u, bid) {
  auth(u);
  const b = await get("SELECT * FROM bookings WHERE id=?", bid);
  if (!b) fail(404, "Booking not found");
  const p = await get(
    "SELECT user_id FROM photographers WHERE id=?",
    b.photographer_id,
  );
  if (b.user_id !== u.id && (!p || p.user_id !== u.id) && !isAdmin(u))
    fail(403, "Access denied");
  return b;
}
function publicUser(u) {
  return u
    ? {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        verified: u.verified,
      }
    : null;
}
const publicQuery = `SELECT p.*,u.name,c.name city,c.slug city_slug, (SELECT MIN(price) FROM packages WHERE photographer_id=p.id AND active=1 AND approved=1) starting_price,(SELECT ROUND(AVG(rating),1) FROM reviews WHERE photographer_id=p.id AND visible=1) rating,(SELECT COUNT(*) FROM reviews WHERE photographer_id=p.id AND visible=1) review_count FROM photographers p JOIN users u ON u.id=p.user_id JOIN cities c ON c.id=p.city_id WHERE u.active=1 AND c.active=1 AND p.verification='APPROVED'`;
async function photographerDetail(pid) {
  const p = await get(publicQuery + " AND p.id=?", pid);
  if (!p) fail(404, "Photographer not available");
  const slotsRaw = await all(
    "SELECT * FROM slots WHERE photographer_id=? AND blocked=0 AND start_at>? ORDER BY start_at LIMIT 200",
    pid,
    now(),
  );
  const slots = [];
  for (const s of slotsRaw) {
    if (!(await overlapping(pid, s.start_at, s.end_at))) slots.push(s);
  }
  return {
    ...p,
    packages: await all(
      "SELECT * FROM packages WHERE photographer_id=? AND active=1 AND approved=1 ORDER BY price",
      pid,
    ),
    portfolio: await all(
      "SELECT * FROM portfolios WHERE photographer_id=? AND approved=1 ORDER BY sort_order",
      pid,
    ),
    reviews: await all(
      "SELECT r.*,u.name FROM reviews r JOIN users u ON u.id=r.user_id WHERE photographer_id=? AND visible=1 ORDER BY r.created_at DESC",
      pid,
    ),
    slots,
  };
}
async function bookingList(where, ...args) {
  return await all(
    `SELECT b.*,u.name customer,p.name photographer,c.name city,(SELECT status FROM payments WHERE booking_id=b.id ORDER BY created_at DESC LIMIT 1) payment_status,(SELECT id FROM reviews WHERE booking_id=b.id) review_id,(SELECT id FROM payouts WHERE booking_id=b.id) payout_id FROM bookings b JOIN users u ON u.id=b.user_id JOIN photographers ph ON ph.id=b.photographer_id JOIN users p ON p.id=ph.user_id LEFT JOIN cities c ON c.id=b.city_id ${where} ORDER BY b.created_at DESC LIMIT 500`,
    ...args,
  );
}
async function gateway(path, body, method = "POST") {
  const r = await fetch("https://api.razorpay.com/v1/" + path, {
    method,
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          process.env.RAZORPAY_KEY_ID + ":" + process.env.RAZORPAY_KEY_SECRET,
        ).toString("base64"),
      "Content-Type": "application/json",
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json();
  if (!r.ok)
    fail(
      502,
      "Payment provider could not complete the request. Retry later or contact support.",
    );
  return data;
}
function secureEqual(a, b) {
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}
async function settle(payment, providerId) {
  return await tx(async () => {
    const p = await get("SELECT * FROM payments WHERE id=?", payment.id);
    if (p.status === "SUCCESS")
      return await get("SELECT * FROM bookings WHERE id=?", p.booking_id);
    if (p.status === "REFUNDED")
      return await get("SELECT * FROM bookings WHERE id=?", p.booking_id);
    const b = await get("SELECT * FROM bookings WHERE id=?", p.booking_id);
    const existing = await get(
      "SELECT id FROM payments WHERE booking_id=? AND status='SUCCESS'",
      b.id,
    );
    if (existing && existing.id !== p.id)
      fail(409, "Already paid; payment reconciliation required");
    await run(
      "UPDATE payments SET payment_id=?,status='SUCCESS' WHERE id=?",
      providerId,
      p.id,
    );
    if (
      b.status !== "PENDING_PAYMENT" ||
      b.hold_until < Date.now() ||
      (await overlapping(b.photographer_id, b.start_at, b.end_at, b.id))
    ) {
      await status(
        b,
        "REFUND_REQUESTED",
        null,
        "Payment arrived after reservation ended. Admin refund required.",
      );
      return await get("SELECT * FROM bookings WHERE id=?", b.id);
    }
    await status(
      b,
      "PENDING_PHOTOGRAPHER_CONFIRMATION",
      null,
      "Payment verified. Waiting for photographer acceptance.",
    );
    return await get("SELECT * FROM bookings WHERE id=?", b.id);
  });
}
async function parseBody(req) {
  let size = 0,
    chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 7200000) fail(413, "Request too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);
  if (!raw.length) return { raw, body: {} };
  try {
    return { raw, body: JSON.parse(raw) };
  } catch {
    fail(400, "Invalid JSON");
  }
}
function setCookie(res, name, token, maxAge = 604800, httpOnly = true) {
  const cookieStr = `${name}=${token}; ${httpOnly ? "HttpOnly; " : ""}SameSite=Lax; Path=/; Max-Age=${maxAge}${PROD ? "; Secure" : ""}`;
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookieStr);
  } else if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, cookieStr]);
  } else {
    res.setHeader("Set-Cookie", [existing, cookieStr]);
  }
}
function cookie(res, token, maxAge = 604800) {
  setCookie(res, "ci_session", token, maxAge, true);
}
async function route(req, res, path, q, body, raw, u, session) {
  const method = req.method;
  if (method === "GET" && path === "/api/config")
    return {
      demo: DEMO,
      paymentMode: GATEWAY,
      support: (await get("SELECT value FROM settings WHERE key='support_email'"))
        ?.value,
      insforgeAuth: Boolean(insforge),
    };
  if (method === "GET" && path === "/api/auth/me")
    return { user: publicUser(u), csrf: session?.csrf };
  if (method === "GET" && path.startsWith("/api/auth/oauth/")) {
    const provider = path.split("/")[4];
    if (provider === "callback") {
      const code = q.get("code");
      const err = q.get("error_description") || q.get("error");
      if (err) {
        res.statusCode = 302;
        res.setHeader("Location", "/login?error=" + encodeURIComponent(err));
        res.end();
        return;
      }
      if (!code) {
        res.statusCode = 302;
        res.setHeader("Location", "/login?error=" + encodeURIComponent("Missing authorization code"));
        res.end();
        return;
      }
      if (!insforge) {
        res.statusCode = 302;
        res.setHeader("Location", "/login?error=" + encodeURIComponent("InsForge Auth is not configured"));
        res.end();
        return;
      }
      const pkce = /(?:^|; )ci_pkce=([^;]+)/.exec(req.headers.cookie || "")?.[1];
      const { data, error: exErr } = await insforge.auth.exchangeOAuthCode(code, pkce || "");
      if (exErr || !data?.user) {
        res.statusCode = 302;
        res.setHeader(
          "Location",
          "/login?error=" + encodeURIComponent(exErr?.message || "OAuth authentication failed"),
        );
        res.end();
        return;
      }
      const oUser = data.user;
      const email = (oUser.email || "").toLowerCase();
      const name = oUser.profile?.name || oUser.name || email.split("@")[0] || "ShootMyTour Member";
      if (!email) {
        res.statusCode = 302;
        res.setHeader(
          "Location",
          "/login?error=" + encodeURIComponent("No email address returned by provider"),
        );
        res.end();
        return;
      }
      let user = await get("SELECT * FROM users WHERE email=?", email);
      if (!user) {
        const uid = id();
        await tx(async () => {
          await run(
            "INSERT INTO users(id,name,email,password_hash,phone,role,active,verified,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            uid,
            name,
            email,
            hash(randomBytes(24).toString("hex")),
            "",
            "USER",
            1,
            1,
            now(),
          );
        });
        user = await get("SELECT * FROM users WHERE id=?", uid);
        await notify(
          uid,
          "Welcome to ShootMyTour!",
          "Signed in successfully with your " + (oUser.providers?.[0] || "social") + " account.",
        );
      }
      const token = randomBytes(32).toString("hex"),
        csrf = randomBytes(24).toString("hex");
      await run(
        "INSERT INTO sessions VALUES(?,?,?,?)",
        digest(token),
        user.id,
        csrf,
        Date.now() + 604800000,
      );
      cookie(res, token);
      setCookie(res, "ci_pkce", "", 0, true);
      const target = user.role === "USER"
        ? "/dashboard"
        : user.role === "PHOTOGRAPHER"
          ? "/photographer/dashboard"
          : "/admin";
      res.statusCode = 302;
      res.setHeader("Location", target);
      res.end();
      return;
    }
    if (!["google", "github"].includes(provider)) fail(400, "Unsupported OAuth provider");
    if (!insforge) fail(503, "InsForge Auth is not configured");
    const redirectTo = `${ORIGIN}/api/auth/oauth/callback`;
    const { data, error: oErr } = await insforge.auth.signInWithOAuth({
      provider,
      redirectTo,
    });
    if (oErr || !data?.url) {
      fail(500, oErr?.message || "Failed to initiate OAuth flow");
    }
    if (data.codeVerifier) {
      setCookie(res, "ci_pkce", data.codeVerifier, 600, true);
    }
    res.statusCode = 302;
    res.setHeader("Location", data.url);
    res.end();
    return;
  }
  if (
    method === "POST" &&
    ["/api/auth/register", "/api/auth/register-photographer"].includes(path)
  ) {
    limit("register:" + req.socket.remoteAddress);
    const name = str(body.name, "name", 100),
      email = str(body.email, "email", 254).toLowerCase(),
      password = str(body.password, "password", 128);
    if (!/^\S+@\S+\.\S+$/.test(email)) fail(400, "Invalid email");
    if (password.length < 10)
      fail(400, "Password must contain at least 10 characters");
    const role = path.endsWith("register-photographer")
      ? "PHOTOGRAPHER"
      : "USER";
    if (await get("SELECT id FROM users WHERE email=?", email))
      fail(409, "Email already registered");
    if (
      role === "PHOTOGRAPHER" &&
      !(await get("SELECT id FROM cities WHERE id=? AND active=1", body.city_id))
    )
      fail(400, "Select an active city");
    const uid = id();
    await tx(async () => {
      await run(
        "INSERT INTO users(id,name,email,password_hash,phone,role,created_at) VALUES(?,?,?,?,?,?,?)",
        uid,
        name,
        email,
        hash(password),
        str(body.phone || "", "phone", 30, false),
        role,
        now(),
      );
      if (role === "PHOTOGRAPHER")
        await run(
          "INSERT INTO photographers(id,user_id,city_id,experience,created_at) VALUES(?,?,?,?,?)",
          id(),
          uid,
          body.city_id,
          num(body.experience || 0, "experience", 0, 80),
          now(),
        );
      await notify(
        uid,
        "Welcome to ShootMyTour",
        "Your account is ready. Photographer profiles require admin approval before public listing.",
      );
    });
    if (insforge) {
      void insforge.auth.signUp({ email, password, name }).catch(() => {});
    }
    return { ok: true };
  }
  if (method === "POST" && path === "/api/auth/login") {
    limit("login:" + req.socket.remoteAddress);
    const email = str(body.email, "email", 254).toLowerCase(),
      password = str(body.password, "password", 128);
    let user = await get("SELECT * FROM users WHERE email=?", email);
    if (!user || !check(password, user.password_hash) || !user.active) {
      if (insforge) {
        try {
          const { data: ifData, error: ifErr } = await insforge.auth.signInWithPassword({ email, password });
          if (!ifErr && ifData?.user) {
            if (!user) {
              const uid = id();
              await tx(async () => {
                await run(
                  "INSERT INTO users(id,name,email,password_hash,phone,role,active,verified,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                  uid,
                  ifData.user.name || ifData.user.profile?.name || email.split("@")[0],
                  email,
                  hash(password),
                  "",
                  "USER",
                  1,
                  1,
                  now(),
                );
              });
              user = await get("SELECT * FROM users WHERE id=?", uid);
            }
          }
        } catch {}
      }
      if (!user || !check(password, user.password_hash) || !user.active)
        fail(401, "Invalid email or password");
    }
    const token = randomBytes(32).toString("hex"),
      csrf = randomBytes(24).toString("hex");
    await run(
      "INSERT INTO sessions VALUES(?,?,?,?)",
      digest(token),
      user.id,
      csrf,
      Date.now() + 604800000,
    );
    cookie(res, token);
    return { user: publicUser(user), csrf };
  }
  if (method === "POST" && path === "/api/auth/logout") {
    if (session) await run("DELETE FROM sessions WHERE token=?", session.token);
    cookie(res, "", 0);
    return { ok: true };
  }
  if (method === "POST" && path === "/api/auth/forgot-password") {
    limit("reset:" + req.socket.remoteAddress, 5);
    const user = await get(
      "SELECT id FROM users WHERE email=?",
      str(body.email, "email", 254),
    );
    if (user) {
      const token = randomBytes(32).toString("hex");
      await tx(async () => {
        await run("DELETE FROM reset_tokens WHERE user_id=?", user.id);
        await run(
          "INSERT INTO reset_tokens VALUES(?,?,?)",
          digest(token),
          user.id,
          Date.now() + 1800000,
        );
        await run(
          "INSERT INTO email_outbox(id,user_id,subject,body,created_at) VALUES(?,?,?,?,?)",
          id(),
          user.id,
          "Reset your ShootMyTour password",
          ORIGIN + "/reset-password?token=" + token,
          now(),
        );
      });
    }
    return {
      ok: true,
      message: "If this account exists, a reset email has been queued.",
    };
  }
  if (method === "POST" && path === "/api/auth/reset-password") {
    limit("reset-confirm:" + req.socket.remoteAddress);
    const password = str(body.password, "password", 128);
    if (password.length < 10) fail(400, "Use at least 10 characters");
    const token = await get(
      "SELECT * FROM reset_tokens WHERE token=? AND expires>?",
      digest(str(body.token, "token", 128)),
      Date.now(),
    );
    if (!token) fail(400, "Reset link is invalid or expired");
    await tx(async () => {
      await run(
        "UPDATE users SET password_hash=? WHERE id=?",
        hash(password),
        token.user_id,
      );
      await run("DELETE FROM reset_tokens WHERE user_id=?", token.user_id);
      await run("DELETE FROM sessions WHERE user_id=?", token.user_id);
    });
    return { ok: true };
  }
  if (method === "PATCH" && path === "/api/profile") {
    auth(u);
    await run(
      "UPDATE users SET name=?,phone=? WHERE id=?",
      str(body.name, "name", 100),
      str(body.phone || "", "phone", 30, false),
      u.id,
    );
    return { ok: true };
  }
  if (method === "GET" && path === "/api/cities")
    return await all("SELECT * FROM cities WHERE active=1 ORDER BY name");
  if (method === "GET" && path.startsWith("/api/cities/"))
    return (
      (await get(
        "SELECT * FROM cities WHERE slug=? AND active=1",
        path.split("/").pop(),
      )) || fail(404, "City not found")
    );
  if (method === "GET" && path === "/api/photographers") {
    let rows = await all(publicQuery);
    const city = q.get("city"),
      search = q.get("search")?.toLowerCase();
    if (city)
      rows = rows.filter((p) => p.city_slug === city || p.city_id === city);
    if (search)
      rows = rows.filter((p) =>
        (p.name + " " + p.city + " " + p.categories)
          .toLowerCase()
          .includes(search),
      );
    if (q.get("category"))
      rows = rows.filter((p) =>
        p.categories.toLowerCase().includes(q.get("category").toLowerCase()),
      );
    if (q.get("rating"))
      rows = rows.filter((p) => (p.rating || 0) >= Number(q.get("rating")));
    if (q.get("price"))
      rows = rows.filter(
        (p) =>
          p.starting_price && p.starting_price <= Number(q.get("price")) * 100,
      );
    if (q.get("duration")) {
      const dur = Number(q.get("duration"));
      const filtered = [];
      for (const p of rows) {
        if (
          await get(
            "SELECT id FROM packages WHERE photographer_id=? AND active=1 AND approved=1 AND duration=?",
            p.id,
            dur,
          )
        ) {
          filtered.push(p);
        }
      }
      rows = filtered;
    }
    if (q.get("date")) {
      const dateStr = q.get("date");
      const filtered = [];
      for (const p of rows) {
        const detail = await photographerDetail(p.id);
        const hasSlot = detail.slots.some(
          (s) =>
            new Date(new Date(s.start_at).getTime() + 19800000)
              .toISOString()
              .slice(0, 10) === dateStr,
        );
        if (hasSlot) filtered.push(p);
      }
      rows = filtered;
    }
    const sort = q.get("sort");
    rows.sort(
      sort === "price_asc"
        ? (a, b) =>
            (a.starting_price || Infinity) - (b.starting_price || Infinity)
        : sort === "price_desc"
          ? (a, b) => (b.starting_price || 0) - (a.starting_price || 0)
          : sort === "rating"
            ? (a, b) => (b.rating || 0) - (a.rating || 0)
            : (a, b) => b.featured - a.featured,
    );
    const page = num(q.get("page") || 1, "page", 1, 100000);
    return {
      items: rows.slice((page - 1) * 12, page * 12),
      total: rows.length,
      page,
    };
  }
  if (
    method === "GET" &&
    /^\/api\/photographers\/[^/]+(?:\/(packages|availability|reviews))?$/.test(
      path,
    )
  ) {
    const p = await photographerDetail(path.split("/")[3]);
    const section = path.split("/")[4];
    return section === "availability" ? p.slots : section ? p[section] : p;
  }
  if (method === "GET" && path === "/api/photographer/workspace") {
    const p = await photographer(u);
    return {
      profile: p,
      packages: await all("SELECT * FROM packages WHERE photographer_id=?", p.id),
      slots: await all(
        "SELECT * FROM slots WHERE photographer_id=? ORDER BY start_at",
        p.id,
      ),
      portfolio: await all(
        "SELECT * FROM portfolios WHERE photographer_id=? ORDER BY sort_order",
        p.id,
      ),
      bookings: await bookingList("WHERE b.photographer_id=?", p.id),
      reviews: await all("SELECT * FROM reviews WHERE photographer_id=?", p.id),
      payouts: await all(
        "SELECT p.* FROM payouts p JOIN bookings b ON b.id=p.booking_id WHERE b.photographer_id=?",
        p.id,
      ),
    };
  }
  if (method === "PATCH" && path === "/api/photographer/profile") {
    const p = await photographer(u);
    if (!(await get("SELECT id FROM cities WHERE id=? AND active=1", body.city_id)))
      fail(400, "Select an active city");
    await run(
      "UPDATE photographers SET city_id=?,bio=?,experience=?,languages=?,categories=?,verification='PENDING' WHERE id=?",
      body.city_id,
      str(body.bio || "", "bio", 2000, false),
      num(body.experience, "experience", 0, 80),
      str(body.languages, "languages", 200),
      str(body.categories, "categories", 200),
      p.id,
    );
    await log(u.id, "PROFILE_REVIEW_REQUESTED");
    return {
      ok: true,
      message: "Profile saved and submitted for admin review.",
    };
  }
  if (/^\/api\/photographer\/packages(?:\/[^/]+)?$/.test(path)) {
    const p = await photographer(u),
      pid = path.split("/")[4];
    if (
      pid &&
      !(await get(
        "SELECT id FROM packages WHERE id=? AND photographer_id=?",
        pid,
        p.id,
      ))
    )
      fail(404, "Package not found");
    if (method === "DELETE") {
      await run("UPDATE packages SET active=0 WHERE id=?", pid);
      return { ok: true };
    }
    if (["POST", "PATCH"].includes(method)) {
      const vals = [
        str(body.title, "title", 100),
        str(body.description || "", "description", 1000, false),
        num(body.price, "price in paise", 100, 100000000),
        num(body.duration, "minutes", 15, 720),
        num(body.photos, "photos", 1, 1000),
        num(body.delivery_days, "delivery days", 1, 90),
        truth(body.active ?? true),
      ];
      if (pid)
        await run(
          "UPDATE packages SET title=?,description=?,price=?,duration=?,photos=?,delivery_days=?,active=?,approved=0 WHERE id=?",
          ...vals,
          pid,
        );
      else
        await run(
          "INSERT INTO packages(id,photographer_id,title,description,price,duration,photos,delivery_days,active) VALUES(?,?,?,?,?,?,?,?,?)",
          id(),
          p.id,
          ...vals,
        );
      return { ok: true };
    }
  }
  if (/^\/api\/photographer\/availability(?:\/[^/]+)?$/.test(path)) {
    const p = await photographer(u),
      sid = path.split("/")[4];
    const s = sid
      ? await get("SELECT * FROM slots WHERE id=? AND photographer_id=?", sid, p.id)
      : null;
    if (sid && !s) fail(404, "Slot not found");
    if (s && (await overlapping(p.id, s.start_at, s.end_at)))
      fail(409, "Cannot change reserved availability");
    if (method === "DELETE") {
      await run("UPDATE slots SET blocked=1 WHERE id=?", sid);
      return { ok: true };
    }
    if (["POST", "PATCH"].includes(method)) {
      const start = date(body.start_at),
        end = date(body.end_at);
      if (
        end <= start ||
        start < now() ||
        Date.parse(end) - Date.parse(start) > 12 * 3600000
      )
        fail(400, "Choose a future interval of at most 12 hours");
      if (sid)
        await run(
          "UPDATE slots SET start_at=?,end_at=?,blocked=? WHERE id=?",
          start,
          end,
          truth(body.blocked),
          sid,
        );
      else await run("INSERT INTO slots VALUES(?,?,?,?,0)", id(), p.id, start, end);
      return { ok: true };
    }
  }
  if (method === "POST" && path === "/api/photographer/portfolio") {
    const p = await photographer(u);
    if (
      (await all("SELECT id FROM portfolios WHERE photographer_id=?", p.id)).length >=
      100
    )
      fail(400, "Maximum 100 portfolio images");
    const data = str(body.data, "image", 7100000);
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+\/=]+)$/.exec(
      data,
    );
    if (!match) fail(400, "Only JPEG, PNG and WebP are supported");
    const b = Buffer.from(match[2], "base64");
    if (b.length > 5 * 1024 * 1024) fail(400, "Maximum image size is 5 MB");
    const valid =
      match[1] === "jpeg"
        ? b[0] === 255 && b[1] === 216 && b[2] === 255
        : match[1] === "png"
          ? b
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : b.toString("ascii", 0, 4) === "RIFF" &&
            b.toString("ascii", 8, 12) === "WEBP";
    if (!valid) fail(400, "Invalid image file");
    const name = id() + "." + match[1];
    try {
      writeFileSync(resolve(DATA, "uploads", name), b);
    } catch (err) {
      console.warn("Notice: local disk write skipped:", err.message);
    }
    if (insforge) {
      void insforge.storage
        .from("portfolios")
        .upload(`photographers/${p.id}/${name}`, b, {
          contentType: `image/${match[1]}`,
          upsert: true,
        })
        .catch(() => {});
    }
    await run(
      "INSERT INTO portfolios(id,photographer_id,image,caption,category) VALUES(?,?,?,?,?)",
      id(),
      p.id,
      "/uploads/" + name,
      str(body.caption || "", "caption", 200, false),
      str(body.category || "Travel", "category", 60),
    );
    return { ok: true };
  }
  if (/^\/api\/photographer\/portfolio\/[^/]+$/.test(path)) {
    const p = await photographer(u),
      iid = path.split("/")[4];
    if (
      !(await get(
        "SELECT id FROM portfolios WHERE id=? AND photographer_id=?",
        iid,
        p.id,
      ))
    )
      fail(404, "Image not found");
    if (method === "DELETE") await run("DELETE FROM portfolios WHERE id=?", iid);
    else if (method === "PATCH")
      await run(
        "UPDATE portfolios SET caption=?,category=?,approved=0 WHERE id=?",
        str(body.caption || "", "caption", 200, false),
        str(body.category, "category", 60),
        iid,
      );
    else fail(405, "Method not allowed");
    return { ok: true };
  }
  if (method === "POST" && path === "/api/bookings") {
    auth(u, ["USER"]);
    return await tx(async () => {
      await expire();
      const p = await get(
        "SELECT pk.*,ph.city_id FROM packages pk JOIN photographers ph ON ph.id=pk.photographer_id JOIN users pu ON pu.id=ph.user_id JOIN cities c ON c.id=ph.city_id WHERE pk.id=? AND pk.active=1 AND pk.approved=1 AND ph.verification='APPROVED' AND pu.active=1 AND c.active=1",
        body.package_id,
      );
      if (!p) fail(400, "Package unavailable");
      const s = await get(
        "SELECT * FROM slots WHERE id=? AND photographer_id=? AND blocked=0",
        body.slot_id,
        p.photographer_id,
      );
      if (!s) fail(409, "Slot unavailable");
      const start = s.start_at,
        end = new Date(Date.parse(start) + p.duration * 60000).toISOString();
      if (
        start <= now() ||
        end > s.end_at ||
        (await overlapping(p.photographer_id, start, end))
      )
        fail(409, "Slot unavailable or too short. Please choose another.");
      if (
        (await get(
          "SELECT COUNT(*) n FROM bookings WHERE user_id=? AND status='PENDING_PAYMENT' AND hold_until>?",
          u.id,
          Date.now(),
        )).n >= 3
      )
        fail(429, "Complete or cancel your existing checkout first");
      let discount = 0,
        coupon = null;
      if (body.coupon) {
        coupon = await get(
          "SELECT * FROM coupons WHERE code=? AND active=1 AND expires>?",
          str(body.coupon, "coupon", 50).toUpperCase(),
          now(),
        );
        if (!coupon) fail(400, "Coupon invalid or expired");
        const used = (await get(
          "SELECT COUNT(*) n FROM bookings WHERE coupon_id=? AND (status IN ('PENDING_PHOTOGRAPHER_CONFIRMATION','CONFIRMED','COMPLETED','REFUND_REQUESTED') OR (status='PENDING_PAYMENT' AND hold_until>?))",
          coupon.id,
          Date.now(),
        )).n;
        if (used >= coupon.usage_limit) fail(400, "Coupon fully redeemed");
        discount = Math.min(
          Math.floor((p.price * coupon.percent) / 100),
          coupon.max_discount,
        );
      }
      const bid = id(),
        amount = p.price - discount,
        commission = Math.floor(
          (amount *
            Number(
              (await get("SELECT value FROM settings WHERE key='commission_percent'"))
                .value,
            )) /
            100,
        );
      await run(
        "INSERT INTO bookings(id,user_id,photographer_id,package_id,slot_id,city_id,start_at,end_at,location,notes,people,shoot_type,package_title,duration,photos,delivery_days,total,discount,amount,commission,coupon_id,status,hold_until,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        bid,
        u.id,
        p.photographer_id,
        p.id,
        s.id,
        p.city_id,
        start,
        end,
        str(body.location, "location", 500),
        str(body.notes || "", "notes", 2000, false),
        num(body.people ?? 1, "people", 1, 30),
        str(body.shoot_type || "Travel", "shoot type", 80),
        p.title,
        p.duration,
        p.photos,
        p.delivery_days,
        p.price,
        discount,
        amount,
        commission,
        coupon?.id || null,
        "PENDING_PAYMENT",
        Date.now() + 10 * 60000,
        now(),
      );
      await log(u.id, "BOOKING_CREATED", bid, null, "PENDING_PAYMENT");
      return await get("SELECT * FROM bookings WHERE id=?", bid);
    });
  }
  if (method === "GET" && path === "/api/bookings/my") {
    auth(u);
    return await bookingList("WHERE b.user_id=?", u.id);
  }
  if (method === "GET" && /^\/api\/bookings\/[^/]+$/.test(path)) {
    const b = await booking(u, path.split("/")[3]);
    return {
      ...b,
      messages: await all(
        "SELECT m.*,u.name FROM messages m JOIN users u ON u.id=m.sender_id WHERE booking_id=? ORDER BY created_at",
        b.id,
      ),
      payments: await all(
        "SELECT * FROM payments WHERE booking_id=? ORDER BY created_at",
        b.id,
      ),
      refunds: await all("SELECT * FROM refunds WHERE booking_id=?", b.id),
      logs: await all(
        "SELECT action,old_status,new_status,note,created_at FROM audit_logs WHERE booking_id=? ORDER BY created_at",
        b.id,
      ),
    };
  }
  if (method === "POST" && /^\/api\/bookings\/[^/]+\/messages$/.test(path)) {
    const b = await booking(u, path.split("/")[3]);
    limit("message:" + u.id, 100);
    await run(
      "INSERT INTO messages VALUES(?,?,?,?,?)",
      id(),
      b.id,
      u.id,
      str(body.message, "message", 2000),
      now(),
    );
    return { ok: true };
  }
  if (method === "PATCH" && /^\/api\/bookings\/[^/]+\/cancel$/.test(path)) {
    const b = await booking(u, path.split("/")[3]);
    if (b.user_id !== u.id && !isAdmin(u)) fail(403, "Access denied");
    if (
      ![
        "PENDING_PAYMENT",
        "PENDING_PHOTOGRAPHER_CONFIRMATION",
        "CONFIRMED",
      ].includes(b.status)
    )
      fail(409, "Booking cannot be cancelled");
    await tx(async () =>
      await status(
        b,
        "CANCELLED_BY_USER",
        u.id,
        "Cancellation requested. Paid bookings require admin refund review.",
      ),
    );
    return { ok: true };
  }
  if (
    method === "PATCH" &&
    /^\/api\/photographer\/bookings\/[^/]+\/(accept|reject|complete|cancel|deliver)$/.test(
      path,
    )
  ) {
    const p = await photographer(u),
      b = await booking(u, path.split("/")[4]),
      action = path.split("/")[5];
    if (b.photographer_id !== p.id) fail(403, "Not your booking");
    return await tx(async () => {
      if (action === "deliver") {
        if (b.status !== "COMPLETED") fail(409, "Complete the shoot first");
        await run(
          "UPDATE bookings SET delivery_url=?,delivered_at=? WHERE id=?",
          safeURL(body.url),
          now(),
          b.id,
        );
        await log(u.id, "PHOTOS_DELIVERED", b.id);
        await notify(
          b.user_id,
          "Your photos are ready",
          "Open your booking to access your gallery.",
        );
        return { ok: true };
      }
      const rule = {
        accept: ["PENDING_PHOTOGRAPHER_CONFIRMATION", "CONFIRMED"],
        reject: ["PENDING_PHOTOGRAPHER_CONFIRMATION", "REJECTED"],
        complete: ["CONFIRMED", "COMPLETED"],
        cancel: ["CONFIRMED", "CANCELLED_BY_PHOTOGRAPHER"],
      }[action];
      if (b.status !== rule[0]) fail(409, "Invalid booking transition");
      if (action === "complete" && b.end_at > now())
        fail(409, "Shoot cannot complete before its end time");
      if (action === "accept" && (await overlapping(p.id, b.start_at, b.end_at, b.id)))
        fail(409, "Conflicting booking");
      await status(
        b,
        rule[1],
        u.id,
        body.reason ? str(body.reason, "reason", 500) : "",
      );
      return { ok: true };
    });
  }
  if (method === "POST" && path === "/api/payments/create-order") {
    const b = await booking(u, str(body.booking_id, "booking id", 100));
    if (b.user_id !== u.id) fail(403, "Only the customer can pay");
    await expire();
    const fresh = await get("SELECT * FROM bookings WHERE id=?", b.id);
    if (fresh.status !== "PENDING_PAYMENT" || fresh.hold_until < Date.now())
      fail(409, "Reservation expired or already paid");
    let p = await get(
      "SELECT * FROM payments WHERE booking_id=? AND status='PENDING' ORDER BY created_at DESC LIMIT 1",
      b.id,
    );
    if (p?.order_id) return { ...p, key_id: process.env.RAZORPAY_KEY_ID };
    if (p) fail(409, "Payment order is being created. Please refresh shortly.");
    const paymentId = id();
    await run(
      "INSERT INTO payments(id,booking_id,amount,gateway,created_at) VALUES(?,?,?,?,?)",
      paymentId,
      b.id,
      b.amount,
      GATEWAY,
      now(),
    );
    try {
      const order =
        GATEWAY === "DEMO"
          ? { id: "demo_order_" + id() }
          : await gateway("orders", {
              amount: b.amount,
              currency: "INR",
              receipt: paymentId,
            });
      await run("UPDATE payments SET order_id=? WHERE id=?", order.id, paymentId);
      return {
        ...(await get("SELECT * FROM payments WHERE id=?", paymentId)),
        key_id: process.env.RAZORPAY_KEY_ID,
      };
    } catch (e) {
      await run(
        "UPDATE payments SET status='FAILED',failure_reason='Order creation failed' WHERE id=?",
        paymentId,
      );
      throw e;
    }
  }
  if (method === "POST" && path === "/api/payments/demo") {
    if (!DEMO || GATEWAY !== "DEMO") fail(404, "Not available");
    const p = await get(
      "SELECT * FROM payments WHERE id=? AND gateway='DEMO'",
      body.payment_id,
    );
    if (!p) fail(404, "Payment not found");
    const b = await booking(u, p.booking_id);
    if (b.user_id !== u.id) fail(403, "Access denied");
    if (body.outcome === "failed") {
      if (p.status !== "PENDING") fail(409, "Payment already processed");
      await run(
        "UPDATE payments SET status='FAILED',failure_reason='Simulated decline' WHERE id=?",
        p.id,
      );
      await notify(
        u.id,
        "Payment declined",
        "No money moved. Retry checkout before the reservation expires.",
      );
      return { ok: true };
    }
    return await settle(p, "demo_pay_" + id());
  }
  if (method === "POST" && path === "/api/payments/verify") {
    const p = await get(
      "SELECT * FROM payments WHERE order_id=? AND gateway='RAZORPAY'",
      body.razorpay_order_id,
    );
    if (!p) fail(404, "Order not found");
    const b = await booking(u, p.booking_id);
    if (b.user_id !== u.id) fail(403, "Access denied");
    const expected = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(
        p.order_id + "|" + str(body.razorpay_payment_id, "payment id", 100),
      )
      .digest("hex");
    if (!secureEqual(expected, body.razorpay_signature || ""))
      fail(400, "Payment verification failed");
    const rp = await gateway(
      "payments/" + encodeURIComponent(body.razorpay_payment_id),
      null,
      "GET",
    );
    if (
      rp.order_id !== p.order_id ||
      rp.amount !== p.amount ||
      rp.currency !== "INR" ||
      rp.status !== "captured"
    )
      fail(409, "Payment is not captured yet. Check your dashboard shortly.");
    return await settle(p, rp.id);
  }
  if (method === "POST" && path === "/api/webhooks/razorpay") {
    if (GATEWAY !== "RAZORPAY") fail(404, "Not available");
    const expected = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(raw)
      .digest("hex");
    if (!secureEqual(expected, req.headers["x-razorpay-signature"] || ""))
      fail(400, "Invalid webhook signature");
    const event = req.headers["x-razorpay-event-id"] || digest(raw);
    if (await get("SELECT id FROM webhook_events WHERE id=?", event))
      return { ok: true };
    const entity = body.payload?.payment?.entity;
    if (body.event === "payment.captured" && entity) {
      const p = await get("SELECT * FROM payments WHERE order_id=?", entity.order_id);
      if (
        p &&
        p.amount === entity.amount &&
        entity.currency === "INR" &&
        entity.status === "captured"
      )
        await settle(p, entity.id);
      else if (p) fail(400, "Payment amount mismatch");
    } else if (body.event === "payment.failed" && entity) {
      await run(
        "UPDATE payments SET status='FAILED',failure_reason=? WHERE order_id=? AND status='PENDING'",
        String(entity.error_description || "Gateway declined payment").slice(
          0,
          500,
        ),
        entity.order_id,
      );
    } else if (body.event === "refund.processed") {
      const r = body.payload?.refund?.entity;
      const local = r && (await get("SELECT * FROM refunds WHERE gateway_id=?", r.id));
      if (local && r.status === "processed" && r.amount === local.amount)
        await tx(async () => {
          await run("UPDATE refunds SET status='PROCESSED' WHERE id=?", local.id);
          await run(
            "UPDATE payments SET status='REFUNDED' WHERE id=?",
            local.payment_id,
          );
          const b = await get("SELECT * FROM bookings WHERE id=?", local.booking_id);
          await status(b, "REFUNDED", null, "Gateway confirmed refund.");
        });
    }
    await run("INSERT OR IGNORE INTO webhook_events VALUES(?,?)", event, now());
    return { ok: true };
  }
  if (method === "POST" && path === "/api/reviews") {
    auth(u, ["USER"]);
    const b = await booking(u, body.booking_id);
    if (b.user_id !== u.id || b.status !== "COMPLETED")
      fail(403, "Only your completed bookings can be reviewed");
    if (await get("SELECT id FROM reviews WHERE booking_id=?", b.id))
      fail(409, "Already reviewed");
    await run(
      "INSERT INTO reviews(id,booking_id,user_id,photographer_id,rating,comment,created_at) VALUES(?,?,?,?,?,?,?)",
      id(),
      b.id,
      u.id,
      b.photographer_id,
      num(body.rating, "rating", 1, 5),
      str(body.comment || "", "comment", 2000, false),
      now(),
    );
    const photoUser = await get("SELECT user_id FROM photographers WHERE id=?", b.photographer_id);
    if (photoUser) {
      await notify(
        photoUser.user_id,
        "New review",
        "A customer reviewed a completed shoot.",
      );
    }
    return { ok: true };
  }
  if (method === "GET" && path === "/api/notifications") {
    auth(u);
    return await all(
      "SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
      u.id,
    );
  }
  if (method === "PATCH" && path === "/api/notifications/read") {
    auth(u);
    await run("UPDATE notifications SET is_read=1 WHERE user_id=?", u.id);
    return { ok: true };
  }
  if (path.startsWith("/api/admin/")) {
    admin(u);
    if (method === "GET" && path === "/api/admin/workspace")
      return {
        users: await all(
          "SELECT id,name,email,role,active,created_at FROM users ORDER BY created_at DESC",
        ),
        photographers: await all(
          "SELECT p.*,u.name,c.name city FROM photographers p JOIN users u ON u.id=p.user_id LEFT JOIN cities c ON c.id=p.city_id",
        ),
        cities: await all("SELECT * FROM cities ORDER BY name"),
        packages: await all(
          "SELECT pk.*,u.name photographer FROM packages pk JOIN photographers p ON p.id=pk.photographer_id JOIN users u ON u.id=p.user_id",
        ),
        portfolio: await all("SELECT * FROM portfolios"),
        bookings: await bookingList(""),
        payments: await all("SELECT * FROM payments ORDER BY created_at DESC"),
        refunds: await all("SELECT * FROM refunds ORDER BY created_at DESC"),
        reviews: await all("SELECT * FROM reviews ORDER BY created_at DESC"),
        coupons: await all("SELECT * FROM coupons"),
        payouts: await all("SELECT * FROM payouts"),
        logs: await all(
          "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200",
        ),
        settings: await all("SELECT * FROM settings"),
        outbox: await all(
          "SELECT id,subject,status,attempts,created_at FROM email_outbox ORDER BY created_at DESC LIMIT 100",
        ),
      };
    if (
      method === "PATCH" &&
      /^\/api\/admin\/photographers\/[^/]+\/(verify|reject|feature)$/.test(path)
    ) {
      const pid = path.split("/")[4],
        action = path.split("/")[5],
        p = await get("SELECT * FROM photographers WHERE id=?", pid);
      if (!p) fail(404, "Profile not found");
      if (action === "feature")
        await run(
          "UPDATE photographers SET featured=? WHERE id=?",
          truth(body.featured),
          pid,
        );
      else {
        await run(
          "UPDATE photographers SET verification=? WHERE id=?",
          action === "verify" ? "APPROVED" : "REJECTED",
          pid,
        );
        await notify(
          p.user_id,
          "Verification update",
          action === "verify"
            ? "Your profile is approved."
            : "Your profile needs changes. Please contact support.",
        );
      }
      await log(u.id, "PHOTOGRAPHER_" + action.toUpperCase(), null, null, null, pid);
      return { ok: true };
    }
    if (
      method === "PATCH" &&
      /^\/api\/admin\/(packages|portfolio|reviews)\/[^/]+\/(approve|reject|hide|show)$/.test(
        path,
      )
    ) {
      const [, , , entity, rid, action] = path.split("/");
      const table = {
          packages: "packages",
          portfolio: "portfolios",
          reviews: "reviews",
        }[entity],
        column = entity === "reviews" ? "visible" : "approved";
      if (!(await get(`SELECT id FROM ${table} WHERE id=?`, rid)))
        fail(404, "Record not found");
      await run(
        `UPDATE ${table} SET ${column}=? WHERE id=?`,
        ["approve", "show"].includes(action) ? 1 : 0,
        rid,
      );
      await log(
        u.id,
        entity.toUpperCase() + "_" + action.toUpperCase(),
        null,
        null,
        null,
        rid,
      );
      return { ok: true };
    }
    if (method === "PATCH" && /^\/api\/admin\/users\/[^/]+$/.test(path)) {
      const uid = path.split("/")[4],
        target = await get("SELECT * FROM users WHERE id=?", uid);
      if (!target) fail(404, "User not found");
      if (uid === u.id || target.role === "SUPER_ADMIN")
        fail(400, "Cannot change this account");
      if (body.role !== undefined) {
        if (u.role !== "SUPER_ADMIN") fail(403, "Super admin required");
        if (
          !["USER", "ADMIN"].includes(body.role) ||
          target.role === "PHOTOGRAPHER"
        )
          fail(400, "Only customer/admin role changes are supported");
        await run("UPDATE users SET role=? WHERE id=?", body.role, uid);
      }
      if (body.active !== undefined)
        await run("UPDATE users SET active=? WHERE id=?", truth(body.active), uid);
      await run("DELETE FROM sessions WHERE user_id=?", uid);
      await log(u.id, "USER_UPDATED", null, null, null, uid);
      return { ok: true };
    }
    if (/^\/api\/admin\/cities(?:\/[^/]+)?$/.test(path)) {
      const cid = path.split("/")[4];
      if (method === "DELETE") {
        await run("UPDATE cities SET active=0 WHERE id=?", cid);
        await log(u.id, "CITY_DEACTIVATED", null, null, null, cid);
        return { ok: true };
      }
      if (["POST", "PATCH"].includes(method)) {
        const name = str(body.name, "city", 100),
          slug = str(body.slug, "slug", 100);
        if (!/^[a-z0-9-]+$/.test(slug)) fail(400, "Use a lowercase URL slug");
        if (cid)
          await run(
            "UPDATE cities SET name=?,state=?,slug=?,active=? WHERE id=?",
            name,
            str(body.state || "", "state", 100, false),
            slug,
            truth(body.active ?? true),
            cid,
          );
        else
          await run(
            "INSERT INTO cities(id,name,state,slug) VALUES(?,?,?,?)",
            id(),
            name,
            str(body.state || "", "state", 100, false),
            slug,
          );
        await log(u.id, "CITY_SAVED");
        return { ok: true };
      }
    }
    if (method === "POST" && path === "/api/admin/coupons") {
      const code = str(body.code, "code", 40).toUpperCase();
      if (!/^[A-Z0-9_-]+$/.test(code)) fail(400, "Invalid coupon code");
      await run(
        "INSERT INTO coupons VALUES(?,?,?,?,?,?,1)",
        id(),
        code,
        num(body.percent, "percent", 1, 90),
        num(body.max_discount, "maximum discount in paise", 100),
        num(body.usage_limit, "usage limit", 1, 1000000),
        date(body.expires),
      );
      await log(u.id, "COUPON_CREATED");
      return { ok: true };
    }
    if (method === "PATCH" && /^\/api\/admin\/coupons\/[^/]+$/.test(path)) {
      await run(
        "UPDATE coupons SET active=? WHERE id=?",
        truth(body.active),
        path.split("/")[4],
      );
      await log(u.id, "COUPON_UPDATED");
      return { ok: true };
    }
    if (method === "PATCH" && path === "/api/admin/settings") {
      auth(u, ["SUPER_ADMIN"]);
      await run(
        "UPDATE settings SET value=? WHERE key='commission_percent'",
        String(num(body.commission_percent, "commission percent", 0, 50)),
      );
      const email = str(body.support_email, "support email", 254);
      if (!/^\S+@\S+\.\S+$/.test(email)) fail(400, "Invalid support email");
      await run("UPDATE settings SET value=? WHERE key='support_email'", email);
      await log(u.id, "SETTINGS_UPDATED");
      return { ok: true };
    }
    if (
      method === "PATCH" &&
      /^\/api\/admin\/bookings\/[^/]+\/status$/.test(path)
    ) {
      const b = await booking(u, path.split("/")[4]),
        next = body.status,
        note = str(body.note, "reason", 1000);
      if (
        ![
          "CONFIRMED",
          "COMPLETED",
          "CANCELLED_BY_PHOTOGRAPHER",
          "REFUND_REQUESTED",
        ].includes(next)
      )
        fail(400, "Unsupported admin transition");
      if (["REFUNDED", "COMPLETED"].includes(b.status))
        fail(409, "Finalized booking cannot be overridden");
      const paid = await get(
        "SELECT id FROM payments WHERE booking_id=? AND status='SUCCESS'",
        b.id,
      );
      if (["CONFIRMED", "COMPLETED"].includes(next) && !paid)
        fail(
          409,
          "Verified payment is required; unpaid overrides are intentionally disabled",
        );
      if (
        next === "COMPLETED" &&
        (b.status !== "CONFIRMED" || b.end_at > now())
      )
        fail(409, "Only a confirmed past shoot may be completed");
      if (
        next === "CONFIRMED" &&
        (b.start_at < now() ||
          (await overlapping(b.photographer_id, b.start_at, b.end_at, b.id)))
      )
        fail(409, "Unavailable booking interval");
      if (next === "REFUND_REQUESTED" && !paid)
        fail(409, "No captured payment to refund");
      await tx(async () => await status(b, next, u.id, note));
      return { ok: true };
    }
    if (
      method === "POST" &&
      /^\/api\/admin\/payments\/[^/]+\/refund$/.test(path)
    ) {
      const p = await get("SELECT * FROM payments WHERE id=?", path.split("/")[4]);
      if (!p || p.status !== "SUCCESS")
        fail(409, "No captured payment to refund");
      const b = await booking(u, p.booking_id);
      if (
        ![
          "REJECTED",
          "CANCELLED_BY_USER",
          "CANCELLED_BY_PHOTOGRAPHER",
          "REFUND_REQUESTED",
        ].includes(b.status)
      )
        fail(409, "Cancel or reject the booking before issuing a refund");
      if (await get("SELECT id FROM payouts WHERE booking_id=?", b.id))
        fail(409, "Payout exists. Manual reconciliation required");
      if (
        await get(
          "SELECT id FROM refunds WHERE payment_id=? AND status IN ('PENDING','PROCESSED')",
          p.id,
        )
      )
        fail(409, "Refund already requested");
      const rid = id(),
        reason = str(body.reason, "refund reason", 1000);
      await run(
        "INSERT INTO refunds VALUES(?,?,?,?,?,?,?,?)",
        rid,
        b.id,
        p.id,
        null,
        p.amount,
        "PENDING",
        reason,
        now(),
      );
      try {
        const result =
          p.gateway === "DEMO"
            ? { id: "demo_refund_" + id(), status: "processed" }
            : await gateway(
                "payments/" + encodeURIComponent(p.payment_id) + "/refund",
                { amount: p.amount, receipt: rid, notes: { reason } },
              );
        await tx(async () => {
          await run(
            "UPDATE refunds SET gateway_id=?,status=? WHERE id=?",
            result.id,
            result.status === "processed" ? "PROCESSED" : "PENDING",
            rid,
          );
          if (result.status === "processed") {
            await run("UPDATE payments SET status='REFUNDED' WHERE id=?", p.id);
            await status(b, "REFUNDED", u.id, reason);
          } else await status(b, "REFUND_REQUESTED", u.id, reason);
        });
        return { ok: true };
      } catch (e) {
        await log(u.id, "REFUND_RECONCILIATION_REQUIRED", b.id, null, null, rid);
        throw e;
      }
    }
    if (method === "POST" && path === "/api/admin/payouts") {
      const b = await booking(u, body.booking_id);
      if (b.status !== "COMPLETED" || !b.delivered_at)
        fail(409, "Complete shoot and deliver photos first");
      if (
        !(await get(
          "SELECT id FROM payments WHERE booking_id=? AND status='SUCCESS'",
          b.id,
        ))
      )
        fail(409, "Payment not captured");
      await run(
        "INSERT INTO payouts VALUES(?,?,?,?,?,?)",
        id(),
        b.id,
        b.amount - b.commission,
        str(body.reference, "bank transfer reference", 200),
        u.id,
        now(),
      );
      await log(u.id, "MANUAL_PAYOUT_RECORDED", b.id);
      return { ok: true };
    }
    if (method === "GET" && path === "/api/admin/dev-outbox") {
      if (!DEMO) fail(404, "Only available in local demo");
      return await all(
        "SELECT e.*,u.email FROM email_outbox e JOIN users u ON u.id=e.user_id ORDER BY created_at DESC LIMIT 50",
      );
    }
  }
  fail(404, "Endpoint not found");
}
export async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(),microphone=(),geolocation=()");
  if (PROD)
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' https://checkout.razorpay.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://images.unsplash.com https://*.razorpay.com https://*.insforge.app https://*.googleusercontent.com https://avatars.githubusercontent.com; connect-src 'self' https://*.razorpay.com https://*.insforge.app https://api.insforge.dev; frame-src https://*.razorpay.com; object-src 'none'; base-uri 'self'; form-action 'self' https://*.insforge.app https://accounts.google.com https://github.com",
  );
  try {
    const proto = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
    const reqOrigin = `${proto}://${host}`;
    const rawPath = req.headers["x-forwarded-uri"] || req.headers["x-matched-path"] || req.url;
    const url = new URL(rawPath, reqOrigin);
    let path = decodeURIComponent(url.pathname);
    if (path === "/api" && url.searchParams.has("path")) {
      path = "/api/" + url.searchParams.get("path").replace(/^\//, "");
    }
    if (path.split("/").some((part) => part.startsWith(".")))
      fail(404, "File not found");
    if (path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store");
      let session = null,
        u = null;
      const token = /(?:^|; )ci_session=([a-f0-9]+)/.exec(
        req.headers.cookie || "",
      )?.[1];
      if (token) {
        session = await get(
          "SELECT * FROM sessions WHERE token=? AND expires>?",
          digest(token),
          Date.now(),
        );
        if (session) {
          u = await get(
            "SELECT * FROM users WHERE id=? AND active=1",
            session.user_id,
          );
          if (!u) session = null;
        }
      }
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method),
        webhook = path === "/api/webhooks/razorpay";
      if (mutating && !webhook) {
        const origin = req.headers.origin;
        const isAllowedOrigin =
          origin === ORIGIN ||
          origin === reqOrigin ||
          (origin && (origin.endsWith(".vercel.app") || origin.includes("localhost")));
        if (!origin || !isAllowedOrigin) fail(403, "Untrusted request origin");
        if (session && req.headers["x-csrf-token"] !== session.csrf)
          fail(403, "Session expired. Refresh and try again.");
      }
      const { body, raw } = mutating
        ? await parseBody(req)
        : { body: {}, raw: Buffer.alloc(0) };
      const data = await route(
        req,
        res,
        path,
        url.searchParams,
        body,
        raw,
        u,
        session,
      );
      if (res.writableEnded) return;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) fail(405, "Method not allowed");
    const upload = path.startsWith("/uploads/");
    if (upload) {
      const image = await get(
        "SELECT i.approved,p.user_id FROM portfolios i JOIN photographers p ON p.id=i.photographer_id WHERE i.image=?",
        path,
      );
      if (!image) fail(404, "Image not found");
      if (!image.approved) {
        const token = /(?:^|; )ci_session=([a-f0-9]+)/.exec(
          req.headers.cookie || "",
        )?.[1];
        const viewer = token
          ? await get(
              "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1",
              digest(token),
              Date.now(),
            )
          : null;
        if (!viewer || (viewer.id !== image.user_id && !isAdmin(viewer)))
          fail(404, "Image not found");
        res.setHeader("Cache-Control", "private, no-store");
      }
    }
    let file = upload
      ? resolve(DATA, path.slice(1))
      : resolve(ROOT, "public", "." + path);
    const base = upload ? resolve(DATA, "uploads") : resolve(ROOT, "public");
    if (!file.startsWith(base + "/") && !file.startsWith(base + sep) && file !== base)
      fail(403, "Invalid path");
    if (!extname(path)) file = resolve(ROOT, "public/index.html");
    if (!existsSync(file)) fail(404, "File not found");
    const mime = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
    };
    res.setHeader(
      "Content-Type",
      mime[extname(file)] || "application/octet-stream",
    );
    if (!res.hasHeader("Cache-Control"))
      res.setHeader(
        "Cache-Control",
        extname(file) === ".html"
          ? "no-cache"
          : upload
            ? "private, no-store"
            : "public, max-age=3600",
      );
    res.end(req.method === "HEAD" ? undefined : readFileSync(file));
  } catch (e) {
    const statusCode =
      e.status ||
      (e.message?.includes("UNIQUE constraint") ||
      e.message?.includes("Overlapping availability")
        ? 409
        : 500);
    if (statusCode === 500) console.error("[request error]", e.message);
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error:
          statusCode === 500
            ? "Unexpected server error. Please try again."
            : statusCode === 409 && !e.status
              ? "This record already exists or overlaps another reservation."
              : e.message,
      }),
    );
  }
}
let sending = false;
async function emailWorker() {
  if (sending || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return;
  sending = true;
  try {
    for (const e of await all(
      "SELECT e.*,u.email FROM email_outbox e JOIN users u ON u.id=e.user_id WHERE status='PENDING' AND attempts<5 ORDER BY created_at LIMIT 10",
    )) {
      try {
        const isSandbox = !process.env.RESEND_DOMAIN_VERIFIED;
        const devOverride =
          process.env.DEV_EMAIL_OVERRIDE || "sk5512410@gmail.com";
        const targetEmail =
          isSandbox && e.email !== devOverride ? devOverride : e.email;
        const subjectPrefix =
          targetEmail !== e.email ? `[For: ${e.email}] ` : "";

        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + process.env.RESEND_API_KEY,
            "Content-Type": "application/json",
            "Idempotency-Key": e.id,
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM,
            to: targetEmail,
            subject: subjectPrefix + e.subject,
            text: e.body,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; border: 1px solid #dedfd6; border-radius: 12px; background: #fcfbf8; color: #243e36;">
                <div style="border-bottom: 2px solid #203e34; padding-bottom: 14px; margin-bottom: 24px;">
                  <h2 style="margin: 0; color: #203e34; letter-spacing: -0.5px; font-family: Georgia, serif;">ShootMyTour</h2>
                  <p style="margin: 4px 0 0; font-size: 13px; color: #657069; text-transform: uppercase; letter-spacing: 0.8px;">Travel Photography Across India</p>
                </div>
                <h3 style="margin-top: 0; color: #203e34; font-size: 20px;">${e.subject}</h3>
                <div style="font-size: 15px; line-height: 1.65; white-space: pre-wrap; color: #243e36; background: #f3f1eb; padding: 18px; border-radius: 8px; border-left: 4px solid #a64b2a;">${e.body}</div>
                <div style="margin-top: 36px; padding-top: 16px; border-top: 1px solid #dedfd6; font-size: 12px; color: #657069; text-align: center;">
                  ShootMyTour · Made for India. Made for you.<br/>
                  <a href="${ORIGIN}" style="color: #a64b2a; text-decoration: none;">Visit ShootMyTour</a>
                </div>
              </div>
            `,
          }),
          signal: AbortSignal.timeout(10000),
        });
        const resData = await r.json().catch(() => ({}));
        if (r.ok) {
          await run(
            "UPDATE email_outbox SET attempts=attempts+1,status='SENT' WHERE id=?",
            e.id,
          );
          console.log(`[Email Sent] ${e.subject} -> ${targetEmail}`);
        } else {
          console.warn("[Resend Error]", resData.message || r.statusText);
          await run("UPDATE email_outbox SET attempts=attempts+1 WHERE id=?", e.id);
        }
      } catch (err) {
        console.warn("[Email Worker Error]", err.message);
        await run("UPDATE email_outbox SET attempts=attempts+1 WHERE id=?", e.id);
      }
    }
  } finally {
    sending = false;
  }
}
let timer = null;
if (!process.env.VERCEL) {
  timer = setInterval(async () => {
    try {
      await expire();
      await run("DELETE FROM sessions WHERE expires<?", Date.now());
      await run("DELETE FROM reset_tokens WHERE expires<?", Date.now());
    } catch (e) {
      console.error("Maintenance failed:", e.message);
    }
    void emailWorker();
  }, 30000);
  timer.unref();
}
export default handler;
if (!process.env.VERCEL) {
  const server = http.createServer(handler);
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.listen(PORT, HOST, () =>
    console.log(
      `ShootMyTour ready: ${ORIGIN}\nMode: ${DEMO ? "LOCAL DEMO · fictional profiles" : "LIVE"} | Database: ${isCloudPostgres() ? "Cloud Postgres (InsForge Direct)" : "Local SQLite"} | Payments: ${GATEWAY}`,
    ),
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => {
      clearInterval(timer);
      server.close(async () => {
        await closeDb();
        process.exit(0);
      });
    });
}
