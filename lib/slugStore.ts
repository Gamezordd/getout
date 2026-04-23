import { getSql } from "./serverAuth";
import { redis } from "./redis";
import { generateRandomSlug } from "./wordList";

let schemaReady: Promise<void> | null = null;

export const ensureSlugSchema = async () => {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS group_slugs (
          slug TEXT PRIMARY KEY,
          session_id TEXT NOT NULL UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS group_slugs_session_id_idx
        ON group_slugs (session_id)
      `;
    })();
  }
  await schemaReady;
};

export const createSlugForSession = async (sessionId: string): Promise<string> => {
  await ensureSlugSchema();
  const sql = getSql();

  for (let attempt = 0; attempt < 10; attempt++) {
    const slug = generateRandomSlug();
    try {
      await sql`
        INSERT INTO group_slugs (slug, session_id)
        VALUES (${slug}, ${sessionId})
        ON CONFLICT DO NOTHING
      `;
      const rows = (await sql`
        SELECT slug FROM group_slugs WHERE session_id = ${sessionId} LIMIT 1
      `) as Array<{ slug: string }>;
      if (rows[0]) return rows[0].slug;
    } catch {
      // collision — retry
    }
  }
  throw new Error("Unable to allocate a group slug. All names are in use.");
};

export const findSessionBySlug = async (slug: string): Promise<string | null> => {
  await ensureSlugSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT session_id FROM group_slugs WHERE slug = ${slug} LIMIT 1
  `) as Array<{ session_id: string }>;
  return rows[0]?.session_id ?? null;
};

export const findSlugBySession = async (sessionId: string): Promise<string | null> => {
  await ensureSlugSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT slug FROM group_slugs WHERE session_id = ${sessionId} LIMIT 1
  `) as Array<{ slug: string }>;
  return rows[0]?.slug ?? null;
};

export const deleteExpiredSlugs = async (): Promise<number> => {
  await ensureSlugSchema();
  const sql = getSql();
  const deleted = (await sql`
    DELETE FROM group_slugs
    WHERE created_at < NOW() - INTERVAL '48 hours'
    RETURNING session_id
  `) as Array<{ session_id: string }>;

  if (deleted.length > 0) {
    await Promise.all(
      deleted.map(({ session_id }) =>
        redis.del(`group:${session_id}`).catch(() => undefined),
      ),
    );
  }

  return deleted.length;
};
