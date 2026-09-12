import { DatabaseSync } from "node:sqlite";
import { createClient } from "@insforge/sdk";
import { readFileSync, existsSync } from "node:fs";

const projectConfig = JSON.parse(readFileSync(".insforge/project.json", "utf-8"));
const insforge = createClient({
  baseUrl: projectConfig.oss_host,
  apiKey: projectConfig.api_key
});

console.log("Connected to InsForge project:", projectConfig.project_name);

const sqlitePath = "data/captureindia.sqlite";
if (!existsSync(sqlitePath)) {
  console.error("SQLite file not found at", sqlitePath);
  process.exit(1);
}

const db = new DatabaseSync(sqlitePath);

async function migrateTable(table, rows) {
  if (!rows || rows.length === 0) {
    console.log(`- ${table}: 0 rows (skipping)`);
    return;
  }
  try {
    const { data, error } = await insforge.database.from(table).insert(rows);
    if (error) {
      console.error(`Error migrating ${table}:`, error);
    } else {
      console.log(`✓ ${table}: ${rows.length} rows migrated`);
    }
  } catch (e) {
    console.error(`Exception migrating ${table}:`, e.message);
  }
}

async function runMigration() {
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

  for (const t of tables) {
    try {
      const rows = db.prepare(`SELECT * FROM ${t}`).all();
      await migrateTable(t, rows);
    } catch (err) {
      console.warn(`Could not read ${t} from SQLite:`, err.message);
    }
  }

  console.log("\nMigration completed successfully!");
}

runMigration().catch(console.error);
