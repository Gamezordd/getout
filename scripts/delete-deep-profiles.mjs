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

const parseArgValue = (argv, name) => {
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  if (index >= 0) return argv[index + 1] ?? null;
  return null;
};

const hasFlag = (argv, name) => argv.includes(`--${name}`);

const getSql = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL.");
  return neon(url);
};

const runCli = async () => {
  loadEnvFiles();
  const argv = process.argv.slice(2);

  const category = parseArgValue(argv, "category")?.trim() || null;
  const cityKey = parseArgValue(argv, "city")?.trim().toLowerCase() || null;
  const dryRun = hasFlag(argv, "dry-run");

  if (!category && !cityKey) {
    throw new Error("Provide at least one of --category or --city to scope the deletion.");
  }

  const sql = getSql();

  const conditions = [];
  if (category) conditions.push(`category = '${category.replace(/'/g, "''")}'`);
  if (cityKey) conditions.push(`city_key = '${cityKey.replace(/'/g, "''")}'`);
  const whereClause = conditions.join(" AND ");

  const countRows = await sql.query(`SELECT COUNT(*) AS n FROM place_deep_profiles WHERE ${whereClause}`);
  const count = Number(countRows.rows?.[0]?.n ?? countRows[0]?.n ?? 0);

  const scopeDesc = conditions.map((c, i) => [category, cityKey].filter(Boolean)[i] && c).filter(Boolean).join(", ");
  console.log(`Found ${count} row(s) matching: ${whereClause}`);

  if (count === 0) {
    console.log("Nothing to delete.");
    return;
  }

  if (dryRun) {
    console.log(`[dry-run] Would delete ${count} row(s). Re-run without --dry-run to proceed.`);
    return;
  }

  await sql.query(`DELETE FROM place_deep_profiles WHERE ${whereClause}`);
  console.log(`Deleted ${count} row(s).`);
};

runCli().catch((error) => {
  console.error("Fatal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
