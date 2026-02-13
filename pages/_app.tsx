import type { AppProps } from "next/app";
import { AppStoreProvider } from "../lib/store/AppStoreProvider";
import "../styles/globals.css";
import "mapbox-gl/dist/mapbox-gl.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AppStoreProvider>
      <Component {...pageProps} />
    </AppStoreProvider>
  );
}
