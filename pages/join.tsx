import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { useEffect } from "react";
import JoinFlow from "../components/JoinFlow";
import { useAuth } from "../lib/auth/AuthProvider";
import { useAppStore } from "../lib/store/AppStoreProvider";

function JoinPage() {
  const store = useAppStore();
  const { isNative } = useAuth();
  const router = useRouter();
  const sessionId = typeof router.query.sessionId === "string" ? router.query.sessionId : "";

  useEffect(() => {
    if (!router.isReady) return;
    if (!sessionId) {
      void router.replace({ pathname: "/landing" }, undefined, { shallow: true });
      return;
    }
    store.setSession(sessionId, "/");
  }, [router, router.isReady, sessionId, store]);

  if (!router.isReady || !sessionId) return null;

  return (
    <JoinFlow
      onJoined={() => {
        if (store.lockedVenue) {
          void router.replace({ pathname: "/final", query: { sessionId: store.sessionId } }, undefined, { shallow: true });
        } else {
          void router.replace({ pathname: "/", query: { sessionId } });
        }
      }}
      onNativeSignInRequired={(redirectUrl) => {
        if (isNative) {
          void router.replace({ pathname: "/login", query: { redirect: redirectUrl } });
        }
      }}
    />
  );
}

export default observer(JoinPage);
