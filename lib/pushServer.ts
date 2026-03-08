import webpush from "web-push";
import type { GroupPayload } from "./groupStore";

type SendResult = {
  staleUserIds: string[];
};

let isConfigured = false;

const configureWebPush = () => {
  if (isConfigured) return true;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey =
    process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  isConfigured = true;
  return true;
};

const buildNotificationPayload = (params: {
  group: GroupPayload;
  sessionId: string;
  voterId: string;
  venueId: string;
}) => {
  const { group, sessionId, voterId, venueId } = params;
  const voter = group.users.find((user) => user.id === voterId);
  const allVenues = [...group.manualVenues, ...group.venues];
  const venue = allVenues.find((item) => item.id === venueId);

  const title = "New vote";
  const body = `${voter?.name || "Someone"} picked ${venue?.name || "a venue"}`;
  const url = `/?sessionId=${encodeURIComponent(sessionId)}&venueId=${encodeURIComponent(venueId)}`;

  return { title, body, url };
};

const buildVenueLockedPayload = (params: {
  group: GroupPayload;
  sessionId: string;
  organizerId: string;
  venueId: string;
}) => {
  const { group, sessionId, organizerId, venueId } = params;
  const organizer = group.users.find((user) => user.id === organizerId);
  const allVenues = [...group.manualVenues, ...group.venues];
  const venue = allVenues.find((item) => item.id === venueId);

  const title = "Venue locked";
  const body = `${organizer?.name || "Organizer"} locked ${venue?.name || "the venue"}`;
  const url = `/?sessionId=${encodeURIComponent(sessionId)}`;

  return { title, body, url };
};

export const sendVoteNotifications = async (params: {
  group: GroupPayload;
  sessionId: string;
  voterId: string;
  venueId: string;
}): Promise<SendResult> => {
  const { group, sessionId, voterId, venueId } = params;
  const subscriptions = group.pushSubscriptions || {};
  const configured = configureWebPush();
  if (!configured || Object.keys(subscriptions).length === 0) {
    return { staleUserIds: [] };
  }

  const payload = JSON.stringify(
    buildNotificationPayload({ group, sessionId, voterId, venueId }),
  );

  const staleUserIds: string[] = [];
  await Promise.all(
    Object.entries(subscriptions).map(async ([userId, subscription]) => {
      if (userId === voterId || !subscription.endpoint) return;
      try {
        await webpush.sendNotification(subscription as webpush.PushSubscription, payload);
      } catch (error: any) {
        const statusCode = error?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleUserIds.push(userId);
        }
      }
    }),
  );

  return { staleUserIds };
};

export const sendVenueLockedNotifications = async (params: {
  group: GroupPayload;
  sessionId: string;
  organizerId: string;
  venueId: string;
}): Promise<SendResult> => {
  const { group, sessionId, organizerId, venueId } = params;
  const subscriptions = group.pushSubscriptions || {};
  const configured = configureWebPush();
  if (!configured || Object.keys(subscriptions).length === 0) {
    return { staleUserIds: [] };
  }

  const payload = JSON.stringify(
    buildVenueLockedPayload({ group, sessionId, organizerId, venueId }),
  );

  const staleUserIds: string[] = [];
  await Promise.all(
    Object.entries(subscriptions).map(async ([userId, subscription]) => {
      if (userId === organizerId || !subscription.endpoint) return;
      try {
        await webpush.sendNotification(subscription as webpush.PushSubscription, payload);
      } catch (error: any) {
        const statusCode = error?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleUserIds.push(userId);
        }
      }
    }),
  );

  return { staleUserIds };
};
