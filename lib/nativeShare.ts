import { Capacitor, registerPlugin } from "@capacitor/core";

type ShareIntentPayload = {
  text?: string | null;
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

export const isGoogleMapsShareUrl = (value: string) => {
  try {
    const parsed = new URL(value.trim());
    const host = parsed.hostname.toLowerCase();
    return (
      host === "maps.app.goo.gl" ||
      host === "goo.gl" ||
      host.endsWith("google.com") ||
      host.endsWith("google.co.in") ||
      host.endsWith("google.co.uk") ||
      host === "maps.google.com"
    );
  } catch {
    return false;
  }
};

export const getLastSessionId = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_SESSION_ID_KEY);
};

export const setLastSessionId = (sessionId: string) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_SESSION_ID_KEY, sessionId);
};

export const registerNativeShareListener = async (
  onShareText: (text: string) => void,
) => {
  if (!isNativeApp()) {
    return () => undefined;
  }

  const emitIfPresent = async () => {
    const pending = await ShareIntent.getPendingShare().catch(() => null);
    const nextText = pending?.text?.trim();
    if (!nextText) return;
    onShareText(nextText);
    await ShareIntent.clearPendingShare().catch(() => undefined);
  };

  await emitIfPresent();

  const listener = await ShareIntent.addListener(
    "shareIntentReceived",
    async ({ text }) => {
      const nextText = text?.trim();
      if (!nextText) return;
      onShareText(nextText);
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
