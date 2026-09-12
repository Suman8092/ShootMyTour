-- Actual SQLite schema for the delivered runtime. Not PostgreSQL.

CREATE TRIGGER slot_overlap_insert BEFORE INSERT ON slots WHEN EXISTS(SELECT 1 FROM slots WHERE photographer_id=NEW.photographer_id AND start_at<NEW.end_at AND end_at>NEW.start_at) BEGIN SELECT RAISE(ABORT,'Overlapping availability'); END;

CREATE TRIGGER slot_overlap_update BEFORE UPDATE OF start_at,end_at ON slots WHEN EXISTS(SELECT 1 FROM slots WHERE id!=NEW.id AND photographer_id=NEW.photographer_id AND start_at<NEW.end_at AND end_at>NEW.start_at) BEGIN SELECT RAISE(ABORT,'Overlapping availability'); END;

CREATE TABLE audit_logs(id TEXT PRIMARY KEY,booking_id TEXT REFERENCES bookings(id),actor_id TEXT REFERENCES users(id),action TEXT NOT NULL,old_status TEXT,new_status TEXT,note TEXT,created_at TEXT NOT NULL);

CREATE TABLE bookings(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),photographer_id TEXT NOT NULL REFERENCES photographers(id),package_id TEXT NOT NULL REFERENCES packages(id),slot_id TEXT NOT NULL REFERENCES slots(id),city_id TEXT REFERENCES cities(id),start_at TEXT NOT NULL,end_at TEXT NOT NULL,location TEXT NOT NULL,notes TEXT DEFAULT '',people INTEGER NOT NULL CHECK(people>0),shoot_type TEXT,package_title TEXT NOT NULL,duration INTEGER NOT NULL,photos INTEGER NOT NULL,delivery_days INTEGER NOT NULL,total INTEGER NOT NULL,discount INTEGER NOT NULL DEFAULT 0,amount INTEGER NOT NULL CHECK(amount>=0),commission INTEGER NOT NULL DEFAULT 0,coupon_id TEXT,status TEXT NOT NULL,hold_until INTEGER,delivery_url TEXT,delivered_at TEXT,created_at TEXT NOT NULL);

CREATE TABLE cities(id TEXT PRIMARY KEY,name TEXT NOT NULL,state TEXT,country TEXT DEFAULT 'India',slug TEXT NOT NULL UNIQUE,image TEXT,active INTEGER DEFAULT 1);

CREATE TABLE coupons(id TEXT PRIMARY KEY,code TEXT UNIQUE NOT NULL,percent INTEGER NOT NULL CHECK(percent BETWEEN 1 AND 90),max_discount INTEGER NOT NULL,usage_limit INTEGER NOT NULL,expires TEXT NOT NULL,active INTEGER DEFAULT 1);

CREATE TABLE email_outbox(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),subject TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',attempts INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);

CREATE TABLE messages(id TEXT PRIMARY KEY,booking_id TEXT NOT NULL REFERENCES bookings(id),sender_id TEXT NOT NULL REFERENCES users(id),message TEXT NOT NULL,created_at TEXT NOT NULL);

CREATE TABLE notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,message TEXT NOT NULL,is_read INTEGER DEFAULT 0,created_at TEXT NOT NULL);

CREATE TABLE packages(id TEXT PRIMARY KEY,photographer_id TEXT NOT NULL REFERENCES photographers(id),title TEXT NOT NULL,description TEXT DEFAULT '',price INTEGER NOT NULL CHECK(price>0),duration INTEGER NOT NULL CHECK(duration>0),photos INTEGER NOT NULL CHECK(photos>0),delivery_days INTEGER NOT NULL DEFAULT 7 CHECK(delivery_days>0),active INTEGER DEFAULT 1,approved INTEGER DEFAULT 0);

CREATE TABLE payments(id TEXT PRIMARY KEY,booking_id TEXT NOT NULL REFERENCES bookings(id),order_id TEXT UNIQUE,payment_id TEXT UNIQUE,amount INTEGER NOT NULL,currency TEXT NOT NULL DEFAULT 'INR',status TEXT NOT NULL DEFAULT 'PENDING',gateway TEXT NOT NULL,failure_reason TEXT,created_at TEXT NOT NULL);

CREATE TABLE payouts(id TEXT PRIMARY KEY,booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id),amount INTEGER NOT NULL,reference TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL);

CREATE TABLE photographers(id TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE REFERENCES users(id),city_id TEXT REFERENCES cities(id),bio TEXT DEFAULT '',experience INTEGER DEFAULT 0,languages TEXT DEFAULT 'Hindi, English',categories TEXT DEFAULT 'Travel, Couple',verification TEXT DEFAULT 'PENDING' CHECK(verification IN ('PENDING','APPROVED','REJECTED')),featured INTEGER DEFAULT 0,image TEXT DEFAULT '',created_at TEXT NOT NULL);

CREATE TABLE portfolios(id TEXT PRIMARY KEY,photographer_id TEXT NOT NULL REFERENCES photographers(id),image TEXT NOT NULL,caption TEXT,category TEXT,approved INTEGER DEFAULT 0,sort_order INTEGER DEFAULT 0);

CREATE TABLE refunds(id TEXT PRIMARY KEY,booking_id TEXT NOT NULL REFERENCES bookings(id),payment_id TEXT NOT NULL REFERENCES payments(id),gateway_id TEXT UNIQUE,amount INTEGER NOT NULL,status TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);

CREATE TABLE reset_tokens(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);

CREATE TABLE reviews(id TEXT PRIMARY KEY,booking_id TEXT UNIQUE NOT NULL REFERENCES bookings(id),user_id TEXT NOT NULL REFERENCES users(id),photographer_id TEXT NOT NULL REFERENCES photographers(id),rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),comment TEXT,visible INTEGER DEFAULT 1,created_at TEXT NOT NULL);

CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);

CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);

CREATE TABLE slots(id TEXT PRIMARY KEY,photographer_id TEXT NOT NULL REFERENCES photographers(id),start_at TEXT NOT NULL,end_at TEXT NOT NULL,blocked INTEGER DEFAULT 0,CHECK(end_at>start_at));

CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password_hash TEXT NOT NULL,phone TEXT,role TEXT NOT NULL CHECK(role IN ('USER','PHOTOGRAPHER','ADMIN','SUPER_ADMIN')),active INTEGER NOT NULL DEFAULT 1,verified INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);

CREATE TABLE webhook_events(id TEXT PRIMARY KEY,created_at TEXT NOT NULL);

CREATE INDEX booking_status ON bookings(status);

CREATE INDEX booking_time ON bookings(photographer_id,start_at,end_at);

CREATE INDEX booking_user ON bookings(user_id);

CREATE UNIQUE INDEX one_refund ON refunds(payment_id) WHERE status IN ('PENDING','PROCESSED');

CREATE UNIQUE INDEX one_success ON payments(booking_id) WHERE status='SUCCESS';

CREATE INDEX photographer_city ON photographers(city_id,verification);

CREATE INDEX slot_time ON slots(photographer_id,start_at,end_at);