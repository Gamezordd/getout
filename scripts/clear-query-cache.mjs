import { neon } from "@neondatabase/serverless";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const loadEnvFiles = () => {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(repoRoot, fileName);
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) continue;
      const key = line.slice(0, separatorIndex).trim();
      if (!key || process.env[key]) continue;
      let value = line.slice(separatorIndex + 1);
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
};

loadEnvFiles();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Missing DATABASE_URL.");
  process.exit(1);
}

const sql = neon(databaseUrl);

const rows = await sql`SELECT COUNT(*) AS count FROM place_vibe_query_cache`;
const count = Number(rows[0]?.count ?? 0);

if (count === 0) {
  console.log("Query cache is already empty.");
  process.exit(0);
}

console.log(`Deleting ${count} cached query vector(s)…`);
await sql`TRUNCATE TABLE place_vibe_query_cache`;
console.log("Done. All query vectors cleared — they will be regenerated on next use.");
