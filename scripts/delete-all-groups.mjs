import { neon } from "@neondatabase/serverless";
import { Redis } from "@upstash/redis";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const GROUP_PREFIX = "group:";
const REDIS_SCAN_COUNT = 200;
const REDIS_DELETE_BATCH_SIZE = 100;
const POSTGRES_DELETE_BATCH_SIZE = 500;
const SESSION_LINK_TABLES = ["user_group_memberships", "group_invites"];

const requiredEnvVars = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "DATABASE_URL",
];

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

const getMissingEnvVars = () =>
  requiredEnvVars.filter((name) => {
    const value = process.env[name];
    return typeof value !== "string" || value.trim().length === 0;
  });

const chunk = (items, size) => {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
};

const parseHoursArgument = (argv) => {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--hours=")) {
      return Number(arg.slice("--hours=".length));
    }
    if (arg === "--hours") {
      return Number(argv[index + 1]);
    }
  }

  return Number.NaN;
};

const loadGroupKeys = async (redis) => {
  const keys = [];
  let cursor = "0";

  do {
    const [nextCursor, batch] = await redis.scan(cursor, {
      match: `${GROUP_PREFIX}*`,
      count: REDIS_SCAN_COUNT,
    });
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== "0");

  return keys;
};

const loadGroups = async (redis, keys) => {
  const groups = [];

  for (const batch of chunk(keys, REDIS_DELETE_BATCH_SIZE)) {
    const loadedBatch = await Promise.all(
      batch.map(async (key) => ({
        key,
        payload: await redis.get(key),
      })),
    );
    groups.push(...loadedBatch);
  }

  return groups;
};

const deriveSessionId = (key) =>
  key.startsWith(GROUP_PREFIX) ? key.slice(GROUP_PREFIX.length) : "";

const isOlderThanCutoff = (createdAt, cutoffMs) => {
  if (typeof createdAt !== "string") return false;
  const createdAtMs = Date.parse(createdAt);
  if (Number.isNaN(createdAtMs)) return false;
  return createdAtMs <= cutoffMs;
};

const deleteRedisKeys = async (redis, keys) => {
  let deletedCount = 0;

  for (const batch of chunk(keys, REDIS_DELETE_BATCH_SIZE)) {
    if (batch.length === 0) continue;
    deletedCount += await redis.del(...batch);
  }

  return deletedCount;
};

const tableExists = async (sql, tableName) => {
  const rows = await sql.query(
    "SELECT to_regclass($1) AS table_name",
    [`public.${tableName}`],
  );
  return Boolean(rows[0]?.table_name);
};

const deleteRowsForTable = async (sql, tableName, sessionIds) => {
  if (!SESSION_LINK_TABLES.includes(tableName)) {
    throw new Error(`Unsupported session link table: ${tableName}`);
  }

  if (sessionIds.length === 0) {
    return 0;
  }

  if (!(await tableExists(sql, tableName))) {
    return 0;
  }

  let deletedCount = 0;

  for (const sessionBatch of chunk(sessionIds, POSTGRES_DELETE_BATCH_SIZE)) {
    const rows = await sql.query(
      `WITH deleted AS (
         DELETE FROM ${tableName}
         WHERE session_id = ANY($1::text[])
         RETURNING 1
       )
       SELECT COUNT(*)::int AS count
       FROM deleted`,
      [sessionBatch],
    );
    deletedCount += rows[0]?.count || 0;
  }

  return deletedCount;
};

const main = async () => {
  loadEnvFiles();

  const hours = parseHoursArgument(process.argv.slice(2));
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error("Missing or invalid --hours value. Example: --hours=24");
  }

  const missingEnvVars = getMissingEnvVars();
  if (missingEnvVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingEnvVars.join(", ")}`,
    );
  }

  const redis = Redis.fromEnv();
  const sql = neon(process.env.DATABASE_URL);
  const cutoffMs = Date.now() - hours * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  const groupKeys = await loadGroupKeys(redis);
  const groups = await loadGroups(redis, groupKeys);

  let skippedLegacyGroups = 0;
  const eligibleGroups = groups.filter(({ payload }) => {
    const createdAt = payload?.createdAt;
    if (typeof createdAt !== "string") {
      skippedLegacyGroups += 1;
      return false;
    }
    return isOlderThanCutoff(createdAt, cutoffMs);
  });

  const eligibleKeys = eligibleGroups.map(({ key }) => key);
  const sessionIds = Array.from(
    new Set(
      eligibleKeys
        .map(deriveSessionId)
        .filter((sessionId) => sessionId.length > 0),
    ),
  );

  const deletedRedisKeys = await deleteRedisKeys(redis, eligibleKeys);
  const [deletedMemberships, deletedInvites] = await Promise.all([
    deleteRowsForTable(sql, "user_group_memberships", sessionIds),
    deleteRowsForTable(sql, "group_invites", sessionIds),
  ]);

  console.log(`Hours cutoff: ${hours}`);
  console.log(`Deleting groups created before: ${cutoffIso}`);
  console.log(`Scanned ${groupKeys.length} Redis group key(s).`);
  console.log(`Eligible Redis group key(s): ${eligibleKeys.length}.`);
  console.log(`Skipped legacy group key(s) without createdAt: ${skippedLegacyGroups}.`);
  console.log(`Deleted ${deletedRedisKeys} Redis group key(s).`);
  console.log(`Deleted ${deletedMemberships} user_group_memberships row(s).`);
  console.log(`Deleted ${deletedInvites} group_invites row(s).`);
};

main().catch((error) => {
  console.error("Failed to delete groups and related database links.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
