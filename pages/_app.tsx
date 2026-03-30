import type { AppProps } from "next/app";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { Toaster } from "sonner";
import NativeBackNavigationManager from "../components/NativeBackNavigationManager";
import UnreadInvitePrompt from "../components/UnreadInvitePrompt";
import { AuthProvider } from "../lib/auth/AuthProvider";
import { initInstallPrompt } from "../lib/installPrompt";
import {
  addNativeNotificationActionListener,
  isNativeNotificationsSupported,
  type NativeNotificationPayload,
} from "../lib/nativeNotifications";
import {
  getLastSessionId,
  isGoogleMapsShareUrl,
  registerNativeShareListener,
  setLastSessionId,
} from "../lib/nativeShare";
import { registerAppServiceWorker } from "../lib/serviceWorker";
import { AppStoreProvider } from "../lib/store/AppStoreProvider";
import "../styles/globals.css";
import "mapbox-gl/dist/mapbox-gl.css";

const buildJoinRoute = (sessionId: string) =>
  `/join?sessionId=${encodeURIComponent(sessionId)}`;

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  const ogImage = siteUrl
    ? `${siteUrl}/icons/getout_icon_md.png`
    : "/icons/getout_icon_md.png";

  useEffect(() => {
    initInstallPrompt();
    registerAppServiceWorker().catch(() => {
      // Ignore service worker registration errors.
    });
  }, []);

  useEffect(() => {
    if (typeof router.query.sessionId !== "string") return;
    setLastSessionId(router.query.sessionId);
  }, [router.query.sessionId]);

  useEffect(() => {
    let cleanup: () => void | Promise<void> = () => undefined;

    const initNativeShare = async () => {
      cleanup = await registerNativeShareListener((sharedText) => {
        if (!isGoogleMapsShareUrl(sharedText)) return;

        const sessionId =
          typeof router.query.sessionId === "string"
            ? router.query.sessionId
            : getLastSessionId();

        void router.push({
          pathname: "/add-venue",
          query: {
            ...(sessionId ? { sessionId } : {}),
            sharedMapsUrl: sharedText,
          },
        });
      });
    };

    void initNativeShare();

    return () => {
      void cleanup();
    };
  }, [router]);

  useEffect(() => {
    if (!isNativeNotificationsSupported()) return;

    let listener:
      | {
          remove: () => Promise<void>;
        }
      | undefined;

    const navigateToLogin = (sessionId: string) => {
      void router.push({
        pathname: "/login",
        query: {
          redirect: buildJoinRoute(sessionId),
        },
      });
    };

    const handleRoute = (route?: string | null) => {
      if (!route) return;
      void router.push(route);
    };

    const handleNotificationAction = async (
      payload: NativeNotificationPayload,
    ) => {
      if (!payload.sessionId || !payload.inviteId) {
        handleRoute(payload.route);
        return;
      }

      try {
        const params = new URLSearchParams({
          sessionId: payload.sessionId,
          inviteId: payload.inviteId,
        });
        const response = await fetch(`/api/invites/resolve-route?${params}`);

        if (response.status === 401) {
          navigateToLogin(payload.sessionId);
          return;
        }

        if (response.ok) {
          const data = (await response.json().catch(() => ({}))) as {
            route?: string;
          };
          if (data.route) {
            handleRoute(data.route);
            return;
          }
        }
      } catch {
        // Fall back to the notification payload route below.
      }

      handleRoute(payload.route || buildJoinRoute(payload.sessionId));
    };

    const init = async () => {
      listener = await addNativeNotificationActionListener((payload) => {
        void handleNotificationAction(payload);
      }).catch(() => undefined);
    };

    void init();

    return () => {
      void listener?.remove();
    };
  }, [router]);

  return (
    <AuthProvider>
      <NativeBackNavigationManager />
      <UnreadInvitePrompt />
      <AppStoreProvider>
        <Head>
          <title>GetOut — Pick a place in minutes</title>

          <meta
            name="description"
            content="Stop the WhatsApp chaos. Vote with friends and lock a place in minutes."
          />

          <meta name="theme-color" content="#111827" />

          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta
            name="apple-mobile-web-app-status-bar-style"
            content="default"
          />
          <meta name="apple-mobile-web-app-title" content="GetOut" />

          <link rel="manifest" href="/manifest.webmanifest" />
          <link rel="icon" href="/icons/getout_icon.png" />
          <link rel="apple-touch-icon" href="/icons/getout_icon_md.png" />

          {/* Open Graph (WhatsApp, Facebook, etc.) */}
          <meta property="og:title" content="Pick a place in minutes" />
          <meta
            property="og:description"
            content="No more group chat chaos. Vote and lock a place instantly."
          />
          <meta property="og:type" content="website" />
          {siteUrl && <meta property="og:url" content={siteUrl} />}
          <meta property="og:image" content={ogImage} />
          <meta property="og:image:width" content="512" />
          <meta property="og:image:height" content="512" />

          {/* Twitter */}
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="Pick a place in minutes" />
          <meta
            name="twitter:description"
            content="Stop the back and forth. Decide with your group instantly."
          />
          <meta name="twitter:image" content={ogImage} />
        </Head>
        <Component {...pageProps} />
        <Toaster
          position="top-center"
          offset={16}
          visibleToasts={3}
          expand
          richColors
          closeButton={false}
          toastOptions={{
            duration: 2800,
            classNames: {
              toast:
                "!rounded-2xl !border !border-slate-200 !bg-white !px-4 !py-3 !shadow-lg !w-[calc(100vw-2rem)] sm:!w-auto",
              title: "!text-sm !font-semibold !text-ink",
              description: "!text-xs !text-slate-500",
            },
          }}
        />
      </AppStoreProvider>
    </AuthProvider>
  );
}
