import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export function hash(password) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function check(password, stored) {
  try {
    const [s, h] = stored.split(":");
    return timingSafeEqual(scryptSync(password, s, 64), Buffer.from(h, "hex"));
  } catch {
    return false;
  }
}
export function connect(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password_hash TEXT NOT NULL,phone TEXT,role TEXT NOT NULL CHECK(role IN ('USER','PHOTOGRAPHER','ADMIN','SUPER_ADMIN')),active INTEGER NOT NULL DEFAULT 1,verified INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS reset_tokens(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS cities(id TEXT PRIMARY KEY,name TEXT NOT NULL,state TEXT,country TEXT DEFAULT 'India',slug TEXT NOT NULL UNIQUE,image TEXT,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS photographers(id TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE REFERENCES users(id),city_id TEXT REFERENCES cities(id),bio TEXT DEFAULT '',experience INTEGER DEFAULT 0,languages TEXT DEFAULT 'Hindi, English',categories TEXT DEFAULT 'Travel, Couple',verification TEXT DEFAULT 'PENDING' CHECK(verification IN ('PENDING','APPROVED','REJECTED')),featured INTEGER DEFAULT 0,image TEXT DEFAULT '',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS packages(id TEXT PRIMARY KEY,photographer_id TEXT NOT NULL REFERENCES photographers(id),title TEXT NOT NULL,description TEXT DEFAULT '',price INTEGER NOT NULL CHECK(price>0),duration INTEGER NOT NULL CHECK(duration>0),photos INTEGER NOT NULL CHECK(photos>0),delivery_days INTEGER NOT NULL DEFAULT 7 CHECK(delivery_days>0),active INTEGER DEFAULT 1,approved INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS slots(id TEXT PRIMARY KEY,photographer_id TEXT NOT NULL REFERENCES photographers(id),start_at TEXT NOT NULL,end_at TEXT NOT NULL,blocked INTEGER DEFAULT 0,CHECK(end_at>start_at));
CREATE INDEX IF NOT EXISTS slot_time ON slots(photographer_id,start_at,end_at);
CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),photographer_id TEXT NOT NULL REFERENCES photographers(id),package_id TEXT NOT NULL REFERENCES packages(id),slot_id TEXT NOT NULL REFERENCES slots(id),city_id TEXT REFERENCES cities(id),start_at TEXT NOT NULL,end_at TEXT NOT NULL,location TEXT NOT NULL,notes TEXT DEFAULT '',people INTEGER NOT NULL CHECK(people>0),shoot_type TEXT,package_title TEXT NOT NULL,duration INTEGER NOT NULL,photos INTEGER NOT NULL,delivery_days INTEGER NOT NULL,total INTEGER NOT NULL,discount INTEGER NOT NULL DEFAULT 0,amount INTEGER NOT NULL CHECK(amount>=0),commission INTEGER NOT NULL DEFAULT 0,coupon_id TEXT,status TEXT NOT NULL,hold_until INTEGER,delivery_url TEXT,delivered_at TEXT,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS booking_time ON bookings(photographer_id,start_at,end_at);
CREATE INDEX IF NOT EXISTS booking_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS booking_status ON bookings(status);
CREATE INDEX IF NOT EXISTS photographer_city ON photographers(city_id,verification);
CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,booking_id TEXT NOT NULL REFERENCES bookings(id),order_id TEXT UNIQUE,payment_id TEXT UNIQUE,amount INTEGER NOT NULL,currency TEXT NOT NULL DEFAULT 'INR',status TEXT NOT NULL DEFAULT 'PENDING',gateway TEXT NOT NULL,failure_reason TEXT,created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS one_success ON payments(booking_id) WHERE status='SUCCESS';
CREATE TABLE IF NOT EXISTS refunds(id TEXT PRIMARY KEY,booking_id TEXT NOT NULL REFERENCES bookings(id),payment_id TEXT NOT NULL REFERENCES payments(id),gateway_id TEXT UNIQUE,amount INTEGER NOT NULL,status TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS one_refund ON refunds(payment_id) WHERE status IN ('PENDING','PROCESSED');
CREATE TABLE IF NOT EXISTS webhook_events(id TEXT PRIMARY KEY,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,booking_id TEXT UNIQUE NOT NULL REFERENCES bookings(id),user_id TEXT NOT NULL REFERENCES users(id),photographer_id TEXT NOT NULL REFERENCES photographers(id),rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),comment TEXT,visible INTEGER DEFAULT 1,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS portfolios(id TEXT PRIMARY KEY,photographer_id TEXT NOT NULL REFERENCES photographers(id),image TEXT NOT NULL,caption TEXT,category TEXT,approved INTEGER DEFAULT 0,sort_order INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,message TEXT NOT NULL,is_read INTEGER DEFAULT 0,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS email_outbox(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),subject TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',attempts INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,booking_id TEXT NOT NULL REFERENCES bookings(id),sender_id TEXT NOT NULL REFERENCES users(id),message TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS coupons(id TEXT PRIMARY KEY,code TEXT UNIQUE NOT NULL,percent INTEGER NOT NULL CHECK(percent BETWEEN 1 AND 90),max_discount INTEGER NOT NULL,usage_limit INTEGER NOT NULL,expires TEXT NOT NULL,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS audit_logs(id TEXT PRIMARY KEY,booking_id TEXT REFERENCES bookings(id),actor_id TEXT REFERENCES users(id),action TEXT NOT NULL,old_status TEXT,new_status TEXT,note TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payouts(id TEXT PRIMARY KEY,booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id),amount INTEGER NOT NULL,reference TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT OR IGNORE INTO settings VALUES('commission_percent','15');
INSERT OR IGNORE INTO settings VALUES('support_email','support@shootmytour.example');
CREATE TRIGGER IF NOT EXISTS slot_overlap_insert BEFORE INSERT ON slots WHEN EXISTS(SELECT 1 FROM slots WHERE photographer_id=NEW.photographer_id AND start_at<NEW.end_at AND end_at>NEW.start_at) BEGIN SELECT RAISE(ABORT,'Overlapping availability'); END;
CREATE TRIGGER IF NOT EXISTS slot_overlap_update BEFORE UPDATE OF start_at,end_at ON slots WHEN EXISTS(SELECT 1 FROM slots WHERE id!=NEW.id AND photographer_id=NEW.photographer_id AND start_at<NEW.end_at AND end_at>NEW.start_at) BEGIN SELECT RAISE(ABORT,'Overlapping availability'); END;
`);
  return db;
}
export function seed(db) {
  if (db.prepare("SELECT COUNT(*) AS n FROM users").get().n) return;
  const insert = (sql, ...args) => db.prepare(sql).run(...args);
  db.exec("BEGIN IMMEDIATE");
  try {
    const cities = [
      "Delhi",
      "Jaipur",
      "Agra",
      "Goa",
      "Udaipur",
      "Mumbai",
      "Varanasi",
      "Manali",
      "Rishikesh",
      "Kochi",
    ];
    const states = [
      "Delhi",
      "Rajasthan",
      "Uttar Pradesh",
      "Goa",
      "Rajasthan",
      "Maharashtra",
      "Uttar Pradesh",
      "Himachal Pradesh",
      "Uttarakhand",
      "Kerala",
    ];
    cities.forEach((c, i) =>
      insert(
        "INSERT INTO cities(id,name,state,slug) VALUES(?,?,?,?)",
        c.toLowerCase(),
        c,
        states[i],
        c.toLowerCase(),
      ),
    );
    const password = hash("Capture@123");
    const people = [
      [
        "demo-customer",
        "Travel Explorer",
        "customer@shootmytour.test",
        "USER",
      ],
      ["demo-admin", "Demo Admin", "admin@shootmytour.test", "SUPER_ADMIN"],
      [
        "demo-photo-1",
        "Aarav Studio",
        "photographer@shootmytour.test",
        "PHOTOGRAPHER",
      ],
      [
        "demo-photo-2",
        "Meera Frames",
        "meera@shootmytour.test",
        "PHOTOGRAPHER",
      ],
      [
        "demo-photo-3",
        "Kabir Stories",
        "kabir@shootmytour.test",
        "PHOTOGRAPHER",
      ],
    ];
    people.forEach((p) =>
      insert(
        "INSERT INTO users(id,name,email,role,password_hash,created_at) VALUES(?,?,?,?,?,?)",
        ...p,
        password,
        now(),
      ),
    );
    const images = [
      "https://images.unsplash.com/photo-1599661046827-dacff0c0f09a?auto=format&fit=crop&w=1200&q=85",
      "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1200&q=85",
      "https://images.unsplash.com/photo-1514222134-b57cbb8ce073?auto=format&fit=crop&w=1200&q=85",
    ];
    ["jaipur", "goa", "udaipur"].forEach((city, i) => {
      const pid = "photographer-" + (i + 1);
      insert(
        "INSERT INTO photographers(id,user_id,city_id,bio,experience,verification,featured,image,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        pid,
        "demo-photo-" + (i + 1),
        city,
        "Unhurried walks, natural light, and photographs that feel like you. This is a fictional demo profile; images are illustrative, not a real portfolio.",
        5 + i,
        "APPROVED",
        1,
        images[i],
        now(),
      );
      ["Gold", "Platinum", "Diamond"].forEach((title, j) =>
        insert(
          "INSERT INTO packages(id,photographer_id,title,description,price,duration,photos,delivery_days,approved) VALUES(?,?,?,?,?,?,?,?,1)",
          pid + "-" + title.toLowerCase(),
          pid,
          title,
          [
            "A little walk. A beautiful memory.",
            "More time to explore, together.",
            "An entire story, thoughtfully captured.",
          ][j],
          [350000, 650000, 1200000][j],
          [60, 120, 240][j],
          [20, 50, 70][j],
          7,
        ),
      );
      for (let d = 1; d <= 10; d++) {
        const date = new Date(Date.now() + d * 86400000)
          .toISOString()
          .slice(0, 10);
        insert(
          "INSERT INTO slots(id,photographer_id,start_at,end_at) VALUES(?,?,?,?)",
          id(),
          pid,
          date + "T03:30:00.000Z",
          date + "T07:30:00.000Z",
        );
      }
      for (let j = 0; j < 5; j++)
        insert(
          "INSERT INTO portfolios(id,photographer_id,image,caption,category,approved,sort_order) VALUES(?,?,?,?,?,1,?)",
          id(),
          pid,
          images[(i + j) % 3],
          "Illustrative destination image · demo only",
          "Travel",
          j,
        );
    });
    insert(
      "INSERT INTO coupons VALUES(?,?,?,?,?,?,?)",
      id(),
      "FIRSTFRAME",
      10,
      100000,
      100,
      new Date(Date.now() + 90 * 86400000).toISOString(),
      1,
    );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
