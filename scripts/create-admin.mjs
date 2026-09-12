import { connect, id, hash, now } from "../server/db.mjs";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
const root = resolve(import.meta.dirname, "..");
if (existsSync(resolve(root, ".env")))
  process.loadEnvFile(resolve(root, ".env"));
const email = process.env.ADMIN_EMAIL,
  password = process.env.ADMIN_PASSWORD;
if (
  !email ||
  !/^\S+@\S+\.\S+$/.test(email) ||
  !password ||
  password.length < 14
)
  throw Error(
    "Set ADMIN_EMAIL and a unique ADMIN_PASSWORD of at least 14 characters through your shell environment.",
  );
const db = connect(
  resolve(root, process.env.DATA_DIR || "data", "captureindia.sqlite"),
);
if (db.prepare("SELECT id FROM users WHERE email=?").get(email))
  throw Error("Account already exists. No changes made.");
db.prepare(
  "INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?)",
).run(
  id(),
  "Platform Admin",
  email.toLowerCase(),
  hash(password),
  "SUPER_ADMIN",
  now(),
);
db.close();
console.log(
  "Super admin created. Clear ADMIN_PASSWORD from your shell environment now.",
);
