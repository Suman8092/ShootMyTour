-- ShootMyTour PostgreSQL Schema for InsForge

CREATE TABLE IF NOT EXISTS cities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT,
  country TEXT DEFAULT 'India',
  slug TEXT NOT NULL UNIQUE,
  image TEXT,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'USER' CHECK(role IN ('USER','PHOTOGRAPHER','ADMIN','SUPER_ADMIN')),
  active INTEGER NOT NULL DEFAULT 1,
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  expires BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS reset_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS photographers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  city_id TEXT REFERENCES cities(id),
  bio TEXT DEFAULT '',
  experience INTEGER DEFAULT 0,
  languages TEXT DEFAULT 'Hindi, English',
  categories TEXT DEFAULT 'Travel, Couple',
  verification TEXT DEFAULT 'PENDING' CHECK(verification IN ('PENDING','APPROVED','REJECTED')),
  featured INTEGER DEFAULT 0,
  image TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS packages (
  id TEXT PRIMARY KEY,
  photographer_id TEXT NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  price BIGINT NOT NULL CHECK(price > 0),
  duration INTEGER NOT NULL CHECK(duration > 0),
  photos INTEGER NOT NULL CHECK(photos > 0),
  delivery_days INTEGER NOT NULL DEFAULT 7 CHECK(delivery_days > 0),
  active INTEGER DEFAULT 1,
  approved INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS slots (
  id TEXT PRIMARY KEY,
  photographer_id TEXT NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  blocked INTEGER DEFAULT 0,
  CHECK(end_at > start_at)
);

CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  percent INTEGER NOT NULL CHECK(percent BETWEEN 1 AND 90),
  max_discount BIGINT NOT NULL,
  usage_limit INTEGER NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  photographer_id TEXT NOT NULL REFERENCES photographers(id),
  package_id TEXT NOT NULL REFERENCES packages(id),
  slot_id TEXT NOT NULL REFERENCES slots(id),
  city_id TEXT REFERENCES cities(id),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  location TEXT NOT NULL,
  notes TEXT DEFAULT '',
  people INTEGER NOT NULL CHECK(people > 0),
  shoot_type TEXT,
  package_title TEXT NOT NULL,
  duration INTEGER NOT NULL,
  photos INTEGER NOT NULL,
  delivery_days INTEGER NOT NULL,
  total BIGINT NOT NULL,
  discount BIGINT NOT NULL DEFAULT 0,
  amount BIGINT NOT NULL CHECK(amount >= 0),
  commission BIGINT NOT NULL DEFAULT 0,
  coupon_id TEXT REFERENCES coupons(id),
  status TEXT NOT NULL,
  hold_until BIGINT,
  delivery_url TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  order_id TEXT UNIQUE,
  payment_id TEXT UNIQUE,
  amount BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'PENDING',
  gateway TEXT NOT NULL,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  payment_id TEXT NOT NULL REFERENCES payments(id),
  gateway_id TEXT UNIQUE,
  amount BIGINT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  booking_id TEXT UNIQUE NOT NULL REFERENCES bookings(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  photographer_id TEXT NOT NULL REFERENCES photographers(id),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT,
  visible INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portfolios (
  id TEXT PRIMARY KEY,
  photographer_id TEXT NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  image TEXT NOT NULL,
  caption TEXT,
  category TEXT,
  approved INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id),
  amount BIGINT NOT NULL,
  reference TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_booking_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_booking_time ON bookings(photographer_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_booking_user ON bookings(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_refund ON refunds(payment_id) WHERE status IN ('PENDING','PROCESSED');
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_success ON payments(booking_id) WHERE status = 'SUCCESS';
CREATE INDEX IF NOT EXISTS idx_photographer_city ON photographers(city_id, verification);
CREATE INDEX IF NOT EXISTS idx_slot_time ON slots(photographer_id, start_at, end_at);
