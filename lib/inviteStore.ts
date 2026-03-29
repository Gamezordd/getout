import type {
  InviteListItem,
  InviteStatus,
  NotificationEndpoint,
  NotificationProvider,
} from "./authTypes";
import { randomUUID } from "crypto";
import { ensureAuthSchema, getSql } from "./serverAuth";

const DEFAULT_INVITE_LIFETIME_DAYS = 7;

type NotificationEndpointRow = {
  id: string;
  user_id: string;
  provider: NotificationProvider;
  platform: string | null;
  device_token: string | null;
  endpoint: string | null;
  subscription_json: PushSubscriptionJSON | null;
  app_version: string | null;
  revoked_at: string | null;
};

type InviteRow = {
  id: string;
  session_id: string;
  inviter_user_id: string;
  recipient_user_id: string;
  status: InviteStatus;
  created_at: string;
  accepted_at: string | null;
  dismissed_at: string | null;
  expires_at: string;
  inviter_display_name: string;
  inviter_avatar_url: string | null;
};

const mapInvite = (row: InviteRow): InviteListItem => ({
  id: row.id,
  sessionId: row.session_id,
  inviter: {
    id: row.inviter_user_id,
    displayName: row.inviter_display_name,
    avatarUrl: row.inviter_avatar_url,
  },
  createdAt: row.created_at,
  joinUrl: `/join?sessionId=${encodeURIComponent(row.session_id)}`,
  status: row.status,
});

const mapNotificationEndpoint = (
  row: NotificationEndpointRow,
): NotificationEndpoint => ({
  id: row.id,
  userId: row.user_id,
  provider: row.provider,
  platform: row.platform,
  token: row.device_token,
  endpoint: row.endpoint,
  subscription: row.subscription_json,
  appVersion: row.app_version,
  revokedAt: row.revoked_at,
});

export const ensureInviteSchema = async () => {
  await ensureAuthSchema();
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS user_notification_endpoints (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      platform TEXT,
      device_token TEXT UNIQUE,
      endpoint TEXT UNIQUE,
      subscription_json JSONB,
      app_version TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS user_notification_endpoints_user_id_idx
    ON user_notification_endpoints (user_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS user_notification_endpoints_provider_idx
    ON user_notification_endpoints (provider, user_id)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS group_invites (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      inviter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      accepted_at TIMESTAMPTZ,
      dismissed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS group_invites_pending_unique_idx
    ON group_invites (session_id, recipient_user_id)
    WHERE status = 'pending'
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS group_invites_recipient_idx
    ON group_invites (recipient_user_id, status, expires_at)
  `;
};

export const registerUserNotificationEndpoint = async (params: {
  userId: string;
  provider: NotificationProvider;
  platform?: string | null;
  token?: string | null;
  subscription?: PushSubscriptionJSON | null;
  appVersion?: string | null;
}) => {
  await ensureInviteSchema();
  const sql = getSql();
  if (params.provider === "fcm") {
    if (!params.token) {
      throw new Error("Missing FCM token.");
    }

    await sql`
      INSERT INTO user_notification_endpoints (
        id,
        user_id,
        provider,
        platform,
        device_token,
        app_version,
        last_seen_at,
        revoked_at
      )
      VALUES (
        ${randomUUID()},
        ${params.userId},
        ${params.provider},
        ${params.platform || null},
        ${params.token},
        ${params.appVersion || null},
        NOW(),
        NULL
      )
      ON CONFLICT (device_token) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        provider = EXCLUDED.provider,
        platform = EXCLUDED.platform,
        app_version = EXCLUDED.app_version,
        last_seen_at = NOW(),
        revoked_at = NULL
    `;
    return;
  }

  const endpoint = params.subscription?.endpoint;
  if (!endpoint || !params.subscription) {
    throw new Error("Missing push subscription endpoint.");
  }

  await sql`
    INSERT INTO user_notification_endpoints (
      id,
      user_id,
      provider,
      platform,
      endpoint,
      subscription_json,
      app_version,
      last_seen_at,
      revoked_at
    )
    VALUES (
      ${randomUUID()},
      ${params.userId},
      ${params.provider},
      ${params.platform || null},
      ${endpoint},
      ${JSON.stringify(params.subscription)}::jsonb,
      ${params.appVersion || null},
      NOW(),
      NULL
    )
    ON CONFLICT (endpoint) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      provider = EXCLUDED.provider,
      platform = EXCLUDED.platform,
      subscription_json = EXCLUDED.subscription_json,
      app_version = EXCLUDED.app_version,
      last_seen_at = NOW(),
      revoked_at = NULL
  `;
};

export const getUserNotificationEndpoints = async (userId: string) => {
  await ensureInviteSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT
      id,
      user_id,
      provider,
      platform,
      device_token,
      endpoint,
      subscription_json,
      app_version,
      revoked_at
    FROM user_notification_endpoints
    WHERE user_id = ${userId}
      AND revoked_at IS NULL
  `) as NotificationEndpointRow[];
  return rows.map(mapNotificationEndpoint);
};

export const revokeUserNotificationEndpointByEndpoint = async (
  endpoint: string,
) => {
  await ensureInviteSchema();
  const sql = getSql();
  await sql`
    UPDATE user_notification_endpoints
    SET revoked_at = NOW()
    WHERE endpoint = ${endpoint}
      AND revoked_at IS NULL
  `;
};

export const revokeUserNotificationEndpointByToken = async (token: string) => {
  await ensureInviteSchema();
  const sql = getSql();
  await sql`
    UPDATE user_notification_endpoints
    SET revoked_at = NOW()
    WHERE device_token = ${token}
      AND revoked_at IS NULL
  `;
};

export const createInvite = async (params: {
  sessionId: string;
  inviterUserId: string;
  recipientUserId: string;
  message?: string | null;
}) => {
  await ensureInviteSchema();
  const sql = getSql();
  const expiresAt = new Date(
    Date.now() + DEFAULT_INVITE_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const rows = (await sql`
    INSERT INTO group_invites (
      id,
      session_id,
      inviter_user_id,
      recipient_user_id,
      status,
      message,
      expires_at
    )
    VALUES (
      ${randomUUID()},
      ${params.sessionId},
      ${params.inviterUserId},
      ${params.recipientUserId},
      'pending',
      ${params.message || null},
      ${expiresAt}
    )
    ON CONFLICT (session_id, recipient_user_id) WHERE status = 'pending'
    DO UPDATE SET
      inviter_user_id = EXCLUDED.inviter_user_id,
      message = EXCLUDED.message,
      expires_at = EXCLUDED.expires_at
    RETURNING id, session_id, inviter_user_id, recipient_user_id, status, created_at, accepted_at, dismissed_at, expires_at
  `) as Array<Omit<InviteRow, "inviter_display_name" | "inviter_avatar_url">>;

  return rows[0];
};

export const listPendingInvitesForRecipient = async (recipientUserId: string) => {
  await ensureInviteSchema();
  const sql = getSql();
  await sql`
    UPDATE group_invites
    SET status = 'expired'
    WHERE recipient_user_id = ${recipientUserId}
      AND status = 'pending'
      AND expires_at <= NOW()
  `;
  const rows = (await sql`
    SELECT
      gi.id,
      gi.session_id,
      gi.inviter_user_id,
      gi.recipient_user_id,
      gi.status,
      gi.created_at,
      gi.accepted_at,
      gi.dismissed_at,
      gi.expires_at,
      u.display_name AS inviter_display_name,
      u.avatar_url AS inviter_avatar_url
    FROM group_invites gi
    INNER JOIN users u ON u.id = gi.inviter_user_id
    WHERE gi.recipient_user_id = ${recipientUserId}
      AND gi.status = 'pending'
      AND gi.expires_at > NOW()
    ORDER BY gi.created_at DESC
  `) as InviteRow[];

  return rows.map(mapInvite);
};

export const dismissInvite = async (params: {
  inviteId: string;
  recipientUserId: string;
}) => {
  await ensureInviteSchema();
  const sql = getSql();
  const rows = (await sql`
    UPDATE group_invites
    SET status = 'dismissed',
        dismissed_at = NOW()
    WHERE id = ${params.inviteId}
      AND recipient_user_id = ${params.recipientUserId}
      AND status = 'pending'
    RETURNING id
  `) as Array<{ id: string }>;
  return rows.length > 0;
};

export const acceptInviteForSession = async (params: {
  sessionId: string;
  recipientUserId: string;
}) => {
  await ensureInviteSchema();
  const sql = getSql();
  await sql`
    UPDATE group_invites
    SET status = 'accepted',
        accepted_at = NOW()
    WHERE session_id = ${params.sessionId}
      AND recipient_user_id = ${params.recipientUserId}
      AND status = 'pending'
      AND expires_at > NOW()
  `;
};
