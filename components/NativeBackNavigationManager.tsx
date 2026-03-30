import { useRouter } from "next/router";
import { useEffect } from "react";
import { useAuth } from "../lib/auth/AuthProvider";
import {
  addNativeBackButtonListener,
  isNativeDashboardBackRoute,
} from "../lib/nativeBackNavigation";

export default function NativeBackNavigationManager() {
  const router = useRouter();
  const { isNative, startupResolved } = useAuth();

  useEffect(() => {
    if (!isNative || !startupResolved) return;

    let handle:
      | {
          remove: () => Promise<void>;
        }
      | undefined;

    const init = async () => {
      handle = await addNativeBackButtonListener(() => {
        const sessionId =
          typeof router.query.sessionId === "string" ? router.query.sessionId : null;

        if (
          isNativeDashboardBackRoute({
            pathname: router.pathname,
            sessionId,
          })
        ) {
          void router.replace("/dashboard");
        }
      }).catch(() => undefined);
    };

    void init();

    return () => {
      void handle?.remove();
    };
  }, [isNative, router, router.pathname, router.query.sessionId, startupResolved]);

  return null;
}
