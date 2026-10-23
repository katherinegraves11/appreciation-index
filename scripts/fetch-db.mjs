// Download the tracker SQLite copy to TRACKER_DB_PATH. Atomic: writes a temp file, then renames.
import fs from "node:fs";
import path from "node:path";
const url = process.env.TRACKER_DB_URL;
const dest = process.env.TRACKER_DB_PATH || "/data/tracker.db";
if (!url) process.exit(0);
const res = await fetch(url, { redirect: "follow" });
if (!res.ok) { console.error(`tracker download: HTTP ${res.status}`); process.exit(1); }
const buf = Buffer.from(await res.arrayBuffer());
if (buf.length < 1_000_000 || buf.subarray(0, 15).toString() !== "SQLite format 3") { console.error("tracker download: not a SQLite file"); process.exit(1); }
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest + ".tmp", buf);
fs.renameSync(dest + ".tmp", dest);
console.log(`tracker.db refreshed (${(buf.length / 1e6).toFixed(1)} MB)`);
