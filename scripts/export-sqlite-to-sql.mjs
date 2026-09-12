import { DatabaseSync } from "node:sqlite";
import { writeFileSync, existsSync } from "node:fs";

const sqlitePath = "data/captureindia.sqlite";
if (!existsSync(sqlitePath)) {
  console.error("SQLite file not found at", sqlitePath);
  process.exit(1);
}

const db = new DatabaseSync(sqlitePath);

function escapeSql(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  // String escaping: replace ' with '' and \ with \\
  return "'" + String(val).replace(/'/g, "''") + "'";
}

const tables = [
  "cities",
  "users",
  "photographers",
  "packages",
  "slots",
  "coupons",
  "settings",
  "portfolios",
  "bookings",
  "payments",
  "refunds",
  "reviews",
  "notifications",
  "email_outbox",
  "messages",
  "audit_logs",
  "payouts"
];

let sqlOut = "-- ShootMyTour Seed Data Export from Local SQLite\n\n";

for (const t of tables) {
  try {
    const rows = db.prepare(`SELECT * FROM ${t}`).all();
    if (rows.length === 0) continue;

    sqlOut += `-- Table: ${t} (${rows.length} rows)\n`;
    for (const r of rows) {
      const cols = Object.keys(r).join(", ");
      const vals = Object.values(r).map(escapeSql).join(", ");
      sqlOut += `INSERT INTO ${t} (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;\n`;
    }
    sqlOut += "\n";
  } catch (err) {
    console.warn(`Skipping ${t}:`, err.message);
  }
}

writeFileSync("scripts/insforge-data.sql", sqlOut, "utf-8");
console.log("Exported data to scripts/insforge-data.sql");
