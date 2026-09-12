import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync, copyFileSync, cpSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
if (existsSync(resolve(root, ".env")))
  process.loadEnvFile(resolve(root, ".env"));
const data = resolve(root, process.env.DATA_DIR || "data"),
  source = resolve(data, "captureindia.sqlite");
if (!existsSync(source)) throw Error("No database to back up");
const target = resolve(
  root,
  "backups",
  new Date().toISOString().replaceAll(":", "-"),
);
mkdirSync(target, { recursive: true });
const db = new DatabaseSync(source);
db.prepare("VACUUM INTO ?").run(resolve(target, "captureindia.sqlite"));
db.close();
if (existsSync(resolve(data, "uploads")))
  cpSync(resolve(data, "uploads"), resolve(target, "uploads"), {
    recursive: true,
  });
console.log(
  "Backup created:",
  target,
  "— encrypt and copy off-host. Pause writes for a database/media-consistent snapshot.",
);
