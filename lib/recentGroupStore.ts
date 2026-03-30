import type { RecentGroupSummary } from "./authTypes";
import { findGroup } from "./groupStore";
import { ensureAuthSchema, getSql } from "./serverAuth";

const RECENT_WINDOW_HOURS = 48;

type MembershipRow = {
  session_id: string;
  last_seen_at: string;
};

const isRecentGroupSummary = (
  group: RecentGroupSummary | null,
): group is RecentGroupSummary => Boolean(group);

const formatRelativeTime = (isoValue: string) => {
  const diffMs = Date.now() - new Date(isoValue).getTime();
  const diffHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  if (diffHours < 1) {
    const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  return `${Math.max(1, Math.floor(diffHours / 24))}d ago`;
};

type LoadedGroup = NonNullable<Awaited<ReturnType<typeof findGroup>>>;

const getGroupTitle = (group: LoadedGroup) => {
  if (group.lockedVenue?.name) return group.lockedVenue.name;
  if (group.manualVenues[0]?.name) return group.manualVenues[0].name;
  if (group.venues[0]?.name) return group.venues[0].name;
  if (group.venueCategory) {
    return `${group.venueCategory.replace("_", " ")} crew`;
  }
  return "Recent group";
};

const getGroupSubtitle = (
  group: LoadedGroup,
  lastSeenAt: string,
) => {
  const locationLabel =
    group.lockedVenue?.address ||
    group.manualVenues[0]?.area ||
    group.manualVenues[0]?.address ||
    group.users[0]?.locationLabel ||
    "Open for voting";
  return `${locationLabel} · ${formatRelativeTime(lastSeenAt)}`;
};

const getGroupImageUrl = (group: LoadedGroup) => {
  const venuePool = [...group.manualVenues, ...group.venues];
  const lockedVenuePhoto = group.lockedVenue
    ? venuePool.find((venue) => venue.id === group.lockedVenue?.id)?.photos?.[0]
    : null;
  return lockedVenuePhoto || venuePool[0]?.photos?.[0] || null;
};

export const ensureRecentGroupSchema = async () => {
  await ensureAuthSchema();
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS user_group_memberships (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, session_id)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS user_group_memberships_recent_idx
    ON user_group_memberships (user_id, last_seen_at DESC)
  `;
};

export const touchRecentGroupMembership = async (params: {
  userId: string;
  sessionId: string;
}) => {
  await ensureRecentGroupSchema();
  const sql = getSql();
  await sql`
    INSERT INTO user_group_memberships (user_id, session_id, joined_at, last_seen_at)
    VALUES (${params.userId}, ${params.sessionId}, NOW(), NOW())
    ON CONFLICT (user_id, session_id) DO UPDATE SET
      last_seen_at = NOW()
  `;
};

export const listRecentGroupsForUser = async (
  userId: string,
): Promise<RecentGroupSummary[]> => {
  await ensureRecentGroupSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT session_id, last_seen_at
    FROM user_group_memberships
    WHERE user_id = ${userId}
      AND last_seen_at > NOW() - (${RECENT_WINDOW_HOURS} * INTERVAL '1 hour')
    ORDER BY last_seen_at DESC
  `) as MembershipRow[];

  const groups: Array<RecentGroupSummary | null> = await Promise.all(
    rows.map(async (row) => {
      const group = await findGroup(row.session_id);
      if (!group) {
        return null;
      }
      return {
        sessionId: row.session_id,
        title: getGroupTitle(group),
        subtitle: getGroupSubtitle(group, row.last_seen_at),
        href: `/?sessionId=${encodeURIComponent(row.session_id)}`,
        status: group.lockedVenue ? "picked" : "live",
        lastActiveAt: row.last_seen_at,
        memberCount: group.users.length,
        memberPreview: group.users
          .slice(0, 4)
          .map<RecentGroupSummary["memberPreview"][number]>((user) => ({
            id: user.id,
            label: user.name?.trim() || "Guest",
            avatarUrl: user.avatarUrl,
          })),
        imageUrl: getGroupImageUrl(group),
        venueCategory: group.venueCategory,
      } satisfies RecentGroupSummary;
    }),
  );

  return groups.filter(isRecentGroupSummary);
};
