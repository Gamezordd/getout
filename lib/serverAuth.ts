import { neon } from "@neondatabase/serverless";
import { OAuth2Client } from "google-auth-library";
import { parse, serialize } from "cookie";
import { randomBytes, randomUUID } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import type { AuthenticatedUser, FriendSummary } from "./authTypes";

const SESSION_COOKIE_NAME = "getout_auth_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
};

type GoogleClaims = {
  sub: string;
  email: string;
  name?: string | null;
  picture?: string | null;
};

export const getSql = () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL.");
  }
  return neon(databaseUrl);
};

const getGoogleClient = () => {
  const clientId = process.env.GOOGLE_AUTH_SERVER_CLIENT_ID;
  if (!clientId) {
    throw new Error("Missing GOOGLE_AUTH_SERVER_CLIENT_ID.");
  }
  return {
    clientId,
    client: new OAuth2Client(clientId),
  };
};

let schemaReady: Promise<void> | null = null;

export const ensureAuthSchema = async () => {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          google_sub TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          avatar_url TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS user_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL,
          revoked_at TIMESTAMPTZ,
          platform TEXT,
          user_agent TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx
        ON user_sessions (user_id)
      `;
    })();
  }
  await schemaReady;
};

const mapUser = (row: UserRow): AuthenticatedUser => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
  provider: "google",
});

export const mapFriendSummary = (row: UserRow): FriendSummary => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
});

const buildCookie = (sessionId: string, expiresAt: Date) =>
  serialize(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

const clearCookie = () =>
  serialize(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });

const getSessionIdFromRequest = (req: NextApiRequest) => {
  const cookies = parse(req.headers.cookie || "");
  const sessionId = cookies[SESSION_COOKIE_NAME];
  return typeof sessionId === "string" && sessionId.length > 0 ? sessionId : null;
};

export const verifyGoogleIdToken = async (idToken: string) => {
  const { client, clientId } = getGoogleClient();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error("Google token payload is missing required claims.");
  }
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  } satisfies GoogleClaims;
};

export const upsertGoogleUser = async (claims: GoogleClaims) => {
  await ensureAuthSchema();
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO users (id, google_sub, email, display_name, avatar_url, updated_at)
    VALUES (
      ${randomUUID()},
      ${claims.sub},
      ${claims.email},
      ${claims.name?.trim() || claims.email},
      ${claims.picture || null},
      NOW()
    )
    ON CONFLICT (google_sub) DO UPDATE SET
      email = EXCLUDED.email,
      display_name = EXCLUDED.display_name,
      avatar_url = EXCLUDED.avatar_url,
      updated_at = NOW()
    RETURNING id, email, display_name, avatar_url
  `) as UserRow[];
  return mapUser(rows[0]);
};

export const createUserSession = async (
  userId: string,
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  await ensureAuthSchema();
  const sql = getSql();
  const sessionId = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await sql`
    INSERT INTO user_sessions (id, user_id, expires_at, platform, user_agent)
    VALUES (
      ${sessionId},
      ${userId},
      ${expiresAt.toISOString()},
      ${req.headers["x-capacitor-platform"] || null},
      ${req.headers["user-agent"] || null}
    )
  `;
  res.setHeader("Set-Cookie", buildCookie(sessionId, expiresAt));
};

export const getAuthenticatedUser = async (req: NextApiRequest) => {
  await ensureAuthSchema();
  const sessionId = getSessionIdFromRequest(req);
  if (!sessionId) return null;
  const sql = getSql();
  const rows = (await sql`
    SELECT u.id, u.email, u.display_name, u.avatar_url
    FROM user_sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.id = ${sessionId}
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
    LIMIT 1
  `) as UserRow[];
  return rows[0] ? mapUser(rows[0]) : null;
};

export const requireAuthenticatedUser = async (req: NextApiRequest) => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    throw new Error("Authentication required.");
  }
  return user;
};

export const revokeSession = async (req: NextApiRequest, res: NextApiResponse) => {
  await ensureAuthSchema();
  const sessionId = getSessionIdFromRequest(req);
  if (sessionId) {
    const sql = getSql();
    await sql`
      UPDATE user_sessions
      SET revoked_at = NOW()
      WHERE id = ${sessionId}
        AND revoked_at IS NULL
    `;
  }
  res.setHeader("Set-Cookie", clearCookie());
};

export const updateAuthenticatedDisplayName = async (
  userId: string,
  displayName: string,
) => {
  await ensureAuthSchema();
  const trimmedName = displayName.trim();
  if (trimmedName.length < 3) {
    throw new Error("Name must be at least 3 characters.");
  }
  const sql = getSql();
  const rows = (await sql`
    UPDATE users
    SET display_name = ${trimmedName},
        updated_at = NOW()
    WHERE id = ${userId}
    RETURNING id, email, display_name, avatar_url
  `) as UserRow[];
  if (!rows[0]) {
    throw new Error("User not found.");
  }
  return mapUser(rows[0]);
};

export const getUserById = async (userId: string) => {
  await ensureAuthSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT id, email, display_name, avatar_url
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `) as UserRow[];
  return rows[0] ? mapUser(rows[0]) : null;
};

export const getUsersByIds = async (userIds: string[]) => {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) {
    return [];
  }
  const users = await Promise.all(uniqueUserIds.map((userId) => getUserById(userId)));
  return users.filter((user): user is NonNullable<typeof user> => Boolean(user));
};

export const getUserByEmail = async (email: string) => {
  await ensureAuthSchema();
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }
  const sql = getSql();
  const rows = (await sql`
    SELECT id, email, display_name, avatar_url
    FROM users
    WHERE LOWER(email) = ${normalizedEmail}
    LIMIT 1
  `) as UserRow[];
  return rows[0] ? mapUser(rows[0]) : null;
};
