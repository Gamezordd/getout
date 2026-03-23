import type { AppProps } from "next/app";
import Head from "next/head";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { initInstallPrompt } from "../lib/installPrompt";
import { registerAppServiceWorker } from "../lib/serviceWorker";
import { AppStoreProvider } from "../lib/store/AppStoreProvider";
import "../styles/globals.css";
import "mapbox-gl/dist/mapbox-gl.css";

export default function App({ Component, pageProps }: AppProps) {
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

  return (
    <AppStoreProvider>
      <Head>
        <title>GetOut</title>
        <meta
          name="description"
          content="Find the best spot for everyone. Fast, simple, and free."
        />
        <meta name="theme-color" content="#111827" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="GetOut" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icons/getout_icon.png" />
        <link rel="apple-touch-icon" href="/icons/getout_icon_md.png" />
        <meta property="og:title" content="GetOut" />
        <meta
          property="og:description"
          content="Find the best spot for everyone. Fast, simple, and free."
        />
        <meta property="og:type" content="website" />
        {siteUrl && <meta property="og:url" content={siteUrl} />}
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="512" />
        <meta property="og:image:height" content="512" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="GetOut" />
        <meta
          name="twitter:description"
          content="Find the best spot for everyone. Fast, simple, and free."
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
  );
}
