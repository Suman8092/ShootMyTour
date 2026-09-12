import { rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
if (existsSync(resolve(root, ".env")))
  process.loadEnvFile(resolve(root, ".env"));
if (
  process.env.NODE_ENV === "production" ||
  process.env.DEMO_MODE === "false" ||
  !process.argv.includes("--confirm")
)
  throw Error(
    "Stop the server, then run npm run demo:reset -- --confirm. Demo mode only.",
  );
const data = resolve(root, process.env.DATA_DIR || "data");
for (const suffix of ["", "-wal", "-shm"])
  rmSync(resolve(data, "captureindia.sqlite" + suffix), { force: true });
console.log(
  "Demo database removed. Restart the app to create fresh demo accounts and future slots. Upload files are retained.",
);
