import { Capacitor, type PluginListenerHandle, registerPlugin } from "@capacitor/core";

export type NativeNotificationPayload = {
  route?: string | null;
  sessionId?: string | null;
  inviteId?: string | null;
};

type NativeNotificationsPlugin = {
  requestPermissions: () => Promise<{ granted: boolean }>;
  getToken: () => Promise<{ token: string | null }>;
  unregisterToken: () => Promise<void>;
  getLaunchNotification: () => Promise<NativeNotificationPayload | null>;
  addListener: (
    eventName: "tokenRefresh" | "notificationAction",
    listener: (payload: any) => void,
  ) => Promise<PluginListenerHandle>;
  removeAllListeners: () => Promise<void>;
};

const NativeNotifications =
  registerPlugin<NativeNotificationsPlugin>("NativeNotifications");

export const isNativeNotificationsSupported = () => Capacitor.isNativePlatform();

export const requestNativeNotificationPermissions = async () =>
  NativeNotifications.requestPermissions();

export const getNativeNotificationToken = async () =>
  NativeNotifications.getToken();

export const unregisterNativeNotificationToken = async () =>
  NativeNotifications.unregisterToken();

export const getNativeLaunchNotification = async () =>
  NativeNotifications.getLaunchNotification();

export const addNativeTokenRefreshListener = async (
  listener: (payload: { token?: string | null }) => void,
) => NativeNotifications.addListener("tokenRefresh", listener);

export const addNativeNotificationActionListener = async (
  listener: (payload: NativeNotificationPayload) => void,
) => NativeNotifications.addListener("notificationAction", listener);
