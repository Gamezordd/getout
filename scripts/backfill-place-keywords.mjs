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

await sql`
  ALTER TABLE place_vibe_profiles
  ADD COLUMN IF NOT EXISTS keywords TEXT[] NOT NULL DEFAULT '{}'
`;
await sql`
  CREATE INDEX IF NOT EXISTS place_vibe_profiles_keywords_idx
  ON place_vibe_profiles USING GIN (keywords)
`;
console.log("Column and index ready.");

const [{ count }] = await sql`
  SELECT COUNT(*) AS count
  FROM place_vibe_profiles
  WHERE type = 'place'
    AND keywords = '{}'
    AND profile_json ? 'keywords'
    AND jsonb_array_length(profile_json->'keywords') > 0
`;

const total = Number(count);
if (total === 0) {
  console.log("No rows to backfill — keywords column is already populated.");
  process.exit(0);
}

console.log(`Backfilling keywords for ${total} place profile(s)…`);

const [{ updated }] = await sql`
  WITH backfilled AS (
    UPDATE place_vibe_profiles
    SET keywords = ARRAY(
      SELECT jsonb_array_elements_text(profile_json->'keywords')
    )
    WHERE type = 'place'
      AND keywords = '{}'
      AND profile_json ? 'keywords'
      AND jsonb_array_length(profile_json->'keywords') > 0
    RETURNING 1
  )
  SELECT COUNT(*) AS updated FROM backfilled
`;

console.log(`Done. Updated ${updated} row(s).`);
