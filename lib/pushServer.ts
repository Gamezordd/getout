import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import webpush from "web-push";
import {
  getUserNotificationEndpoints,
  revokeUserNotificationEndpointByEndpoint,
  revokeUserNotificationEndpointByToken,
} from "./inviteStore";
import type { GroupPayload } from "./groupStore";

type SendResult = {
  staleUserIds: string[];
};

let isConfigured = false;
let firebaseMessaging: Messaging | null | undefined;

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

const getFirebaseServiceAccount = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    return null;
  }

  const parsed = JSON.parse(raw) as {
    project_id: string;
    client_email: string;
    private_key: string;
  };

  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key.replace(/\\n/g, "\n"),
  };
};

const getFirebaseMessagingClient = () => {
  if (firebaseMessaging !== undefined) {
    return firebaseMessaging;
  }

  const serviceAccount = getFirebaseServiceAccount();
  if (!serviceAccount) {
    firebaseMessaging = null;
    return firebaseMessaging;
  }

  const app =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          credential: cert(serviceAccount),
        });

  firebaseMessaging = getMessaging(app);
  return firebaseMessaging;
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

export const sendInviteNotification = async (params: {
  inviteId: string;
  recipientUserId: string;
  inviterDisplayName: string;
  sessionId: string;
}) => {
  const endpoints = await getUserNotificationEndpoints(params.recipientUserId);
  if (endpoints.length === 0) {
    return { delivered: 0, reason: "no_endpoints" as const };
  }

  const title = "Group invite";
  const body = `${params.inviterDisplayName} invited you to contribute to a group.`;
  const route = `/join?sessionId=${encodeURIComponent(params.sessionId)}`;
  const payload = JSON.stringify({
    title,
    body,
    url: route,
    inviteId: params.inviteId,
  });
  const webPushConfigured = configureWebPush();
  const messaging = getFirebaseMessagingClient();
  const hasFcmEndpoint = endpoints.some((endpoint) => endpoint.provider === "fcm");
  if (hasFcmEndpoint && !messaging) {
    return { delivered: 0, reason: "fcm_not_configured" as const };
  }

  let delivered = 0;
  await Promise.all(
    endpoints.map(async (endpoint) => {
      if (endpoint.provider === "fcm") {
        if (!messaging || !endpoint.token) return;
        try {
          await messaging.send({
            token: endpoint.token,
            notification: {
              title,
              body,
            },
            android: {
              priority: "high",
            },
            data: {
              type: "group_invite",
              title,
              body,
              inviteId: params.inviteId,
              sessionId: params.sessionId,
              route,
            },
          });
          delivered += 1;
        } catch (error: any) {
          const code = error?.code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            await revokeUserNotificationEndpointByToken(endpoint.token);
          }
        }
        return;
      }

      if (!webPushConfigured || !endpoint.subscription || !endpoint.endpoint) return;
      try {
        await webpush.sendNotification(
          endpoint.subscription as webpush.PushSubscription,
          payload,
        );
        delivered += 1;
      } catch (error: any) {
        const statusCode = error?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await revokeUserNotificationEndpointByEndpoint(endpoint.endpoint);
        }
      }
    }),
  );

  if (delivered === 0) {
    return { delivered, reason: "not_delivered" as const };
  }

  return { delivered, reason: null };
};
