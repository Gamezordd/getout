import type { AppProps } from "next/app";
import Head from "next/head";
import { AppStoreProvider } from "../lib/store/AppStoreProvider";
import "../styles/globals.css";
import "mapbox-gl/dist/mapbox-gl.css";

export default function App({ Component, pageProps }: AppProps) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  const ogImage = siteUrl ? `${siteUrl}/icons/getout_icon.png` : "/icons/getout_icon.png";

  return (
    <AppStoreProvider>
      <Head>
        <title>GetOut</title>
        <meta
          name="description"
          content="Find the best spot for everyone. Fast, simple, and free."
        />
        <link rel="icon" href="/icons/getout_icon.png" />
        <link rel="apple-touch-icon" href="/icons/getout_icon.png" />
        <meta property="og:title" content="GetOut" />
        <meta
          property="og:description"
          content="Find the best spot for everyone. Fast, simple, and free."
        />
        <meta property="og:type" content="website" />
        {siteUrl && <meta property="og:url" content={siteUrl} />}
        <meta property="og:image" content={ogImage} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="GetOut" />
        <meta
          name="twitter:description"
          content="Find the best spot for everyone. Fast, simple, and free."
        />
        <meta name="twitter:image" content={ogImage} />
      </Head>
      <Component {...pageProps} />
    </AppStoreProvider>
  );
}
