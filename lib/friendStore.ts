import { ensureAuthSchema, getSql, mapFriendSummary } from "./serverAuth";
import type { FriendSummary } from "./authTypes";

type FriendRow = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
};

let schemaReady: Promise<void> | null = null;

export const ensureFriendSchema = async () => {
  if (!schemaReady) {
    schemaReady = (async () => {
      await ensureAuthSchema();
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS user_friends (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          friend_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, friend_user_id)
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS user_friends_friend_idx
        ON user_friends (friend_user_id, created_at DESC)
      `;
    })();
  }
  await schemaReady;
};

export const listFriendsForUser = async (
  userId: string,
): Promise<FriendSummary[]> => {
  await ensureFriendSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT u.id, u.email, u.display_name, u.avatar_url
    FROM user_friends uf
    INNER JOIN users u ON u.id = uf.friend_user_id
    WHERE uf.user_id = ${userId}
    ORDER BY LOWER(u.display_name) ASC, LOWER(u.email) ASC
  `) as FriendRow[];
  return rows.map(mapFriendSummary);
};

export const addFriendForUser = async (params: {
  userId: string;
  friendUserId: string;
}): Promise<FriendSummary | null> => {
  await ensureFriendSchema();
  const sql = getSql();
  const rows = (await sql`
    WITH inserted AS (
      INSERT INTO user_friends (user_id, friend_user_id)
      VALUES (${params.userId}, ${params.friendUserId})
      ON CONFLICT (user_id, friend_user_id) DO NOTHING
      RETURNING friend_user_id
    )
    SELECT u.id, u.email, u.display_name, u.avatar_url
    FROM users u
    INNER JOIN inserted i ON i.friend_user_id = u.id
  `) as FriendRow[];

  return rows[0] ? mapFriendSummary(rows[0]) : null;
};

export const isFriendForUser = async (params: {
  userId: string;
  friendUserId: string;
}) => {
  await ensureFriendSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT 1
    FROM user_friends
    WHERE user_id = ${params.userId}
      AND friend_user_id = ${params.friendUserId}
    LIMIT 1
  `) as Array<{ "?column?": number }>;
  return rows.length > 0;
};

export const removeFriendForUser = async (params: {
  userId: string;
  friendUserId: string;
}) => {
  await ensureFriendSchema();
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM user_friends
    WHERE user_id = ${params.userId}
      AND friend_user_id = ${params.friendUserId}
    RETURNING friend_user_id
  `) as Array<{ friend_user_id: string }>;
  return rows.length > 0;
};
