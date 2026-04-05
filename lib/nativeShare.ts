import { Capacitor, registerPlugin } from "@capacitor/core";

type ShareIntentPayload = {
  text?: string | null;
  target?: "group_venue" | "collection" | null;
};

type ShareIntentPlugin = {
  getPendingShare: () => Promise<ShareIntentPayload>;
  clearPendingShare: () => Promise<void>;
  addListener: (
    eventName: "shareIntentReceived",
    listenerFunc: (payload: ShareIntentPayload) => void,
  ) => Promise<{ remove: () => Promise<void> }>;
};

const ShareIntent = registerPlugin<ShareIntentPlugin>("ShareIntent");

type ShareLauncherPlugin = {
  shareText: (options: {
    text: string;
    title?: string;
  }) => Promise<{ presented: boolean }>;
};

const ShareLauncher = registerPlugin<ShareLauncherPlugin>("ShareLauncher");

export const LAST_SESSION_ID_KEY = "getout-last-session-id";

export const isNativeApp = () => Capacitor.isNativePlatform();

const GOOGLE_MAPS_HOST_MATCHERS = [
  "maps.app.goo.gl",
  "goo.gl",
  "maps.google.com",
] as const;

const isGoogleMapsHost = (host: string) =>
  GOOGLE_MAPS_HOST_MATCHERS.includes(host as (typeof GOOGLE_MAPS_HOST_MATCHERS)[number]) ||
  host.endsWith("google.com") ||
  host.endsWith("google.co.in") ||
  host.endsWith("google.co.uk");

export const extractGoogleMapsShareUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (isGoogleMapsHost(host)) {
      return parsed.toString();
    }
  } catch {
    // Fall through to URL extraction from arbitrary shared text.
  }

  const matches = trimmed.match(/https?:\/\/[^\s]+/gi) || [];
  for (const candidate of matches) {
    try {
      const parsed = new URL(candidate);
      const host = parsed.hostname.toLowerCase();
      if (isGoogleMapsHost(host)) {
        return parsed.toString();
      }
    } catch {
      // Ignore malformed candidates and continue scanning.
    }
  }

  return null;
};

export const isGoogleMapsShareUrl = (value: string) =>
  Boolean(extractGoogleMapsShareUrl(value));

export const getLastSessionId = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_SESSION_ID_KEY);
};

export const setLastSessionId = (sessionId: string) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_SESSION_ID_KEY, sessionId);
};

export const clearLastSessionId = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LAST_SESSION_ID_KEY);
};

export const registerNativeShareListener = async (
  onShareIntent: (payload: {
    text: string;
    target: "group_venue" | "collection";
  }) => void | Promise<void>,
) => {
  if (!isNativeApp()) {
    return () => undefined;
  }

  const emitIfPresent = async () => {
    const pending = await ShareIntent.getPendingShare().catch(() => null);
    const nextText = pending?.text?.trim();
    const nextTarget =
      pending?.target === "collection" ? "collection" : "group_venue";
    if (!nextText) return;
    const extractedUrl = extractGoogleMapsShareUrl(nextText) || nextText;
    await onShareIntent({ text: extractedUrl, target: nextTarget });
    await ShareIntent.clearPendingShare().catch(() => undefined);
  };

  await emitIfPresent();

  const listener = await ShareIntent.addListener(
    "shareIntentReceived",
    async ({ text, target }) => {
      const nextText = text?.trim();
      const nextTarget = target === "collection" ? "collection" : "group_venue";
      if (!nextText) return;
      const extractedUrl = extractGoogleMapsShareUrl(nextText) || nextText;
      await onShareIntent({ text: extractedUrl, target: nextTarget });
      await ShareIntent.clearPendingShare().catch(() => undefined);
    },
  );

  return async () => {
    await listener.remove();
  };
};

export const openNativeShareSheet = async (params: {
  text: string;
  title?: string;
}) => {
  if (!isNativeApp()) {
    throw new Error("Native share is not available.");
  }

  return ShareLauncher.shareText(params);
};
