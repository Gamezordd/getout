import { registerAppServiceWorker } from "./serviceWorker";
import {
  getNativeNotificationToken,
  isNativeNotificationsSupported,
  requestNativeNotificationPermissions,
  unregisterNativeNotificationToken,
} from "./nativeNotifications";

const urlBase64ToUint8Array = (value: string) => {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export const registerPushSubscription = async (params: {
  sessionId: string;
  userId: string;
}) => {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (!("Notification" in window)) return;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return;

  if (Notification.permission === "denied") return;

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") return;

  const registration = await registerAppServiceWorker();
  if (!registration) return;

  const existingSubscription = await registration.pushManager.getSubscription();

  const subscription =
    existingSubscription ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: params.sessionId,
      userId: params.userId,
      subscription: subscription.toJSON(),
    }),
  });
};

export const registerUserPushSubscription = async () => {
  if (typeof window === "undefined") return;
  if (isNativeNotificationsSupported()) {
    const permission = await requestNativeNotificationPermissions().catch(
      () => ({ granted: false }),
    );
    if (!permission.granted) return;

    const tokenResult = await getNativeNotificationToken().catch(() => ({
      token: null,
    }));
    if (!tokenResult.token) return;

    await fetch("/api/push/register-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "fcm",
        platform: "android",
        token: tokenResult.token,
      }),
    });
    return;
  }

  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (!("Notification" in window)) return;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return;

  if (Notification.permission === "denied") return;

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") return;

  const registration = await registerAppServiceWorker();
  if (!registration) return;

  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription =
    existingSubscription ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  await fetch("/api/push/register-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "webpush",
      subscription: subscription.toJSON(),
      platform: "web",
    }),
  });
};

export const unregisterUserPushSubscription = async () => {
  if (typeof window === "undefined") return;
  if (!isNativeNotificationsSupported()) return;

  const tokenResult = await getNativeNotificationToken().catch(() => ({
    token: null,
  }));
  if (!tokenResult.token) return;

  await fetch("/api/push/unregister-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "fcm",
      token: tokenResult.token,
    }),
  }).catch(() => undefined);

  await unregisterNativeNotificationToken().catch(() => undefined);
};
