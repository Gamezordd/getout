import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/router";
import type { AuthenticatedUser, AuthStatus } from "../authTypes";
import useForegroundResume from "../../hooks/useForegroundResume";
import {
  registerUserPushSubscription,
  unregisterUserPushSubscription,
} from "../pushClient";
import {
  isNativePlatform,
  signInWithNativeGoogle,
  signOutOfNativeGoogle,
} from "../nativeGoogleAuth";
import {
  addNativeTokenRefreshListener,
  peekNativeLaunchNotification,
} from "../nativeNotifications";

type AuthContextValue = {
  authStatus: AuthStatus;
  authenticatedUser: AuthenticatedUser | null;
  isNative: boolean;
  startupResolved: boolean;
  hasPendingLaunchNotification: boolean;
  loadSession: () => Promise<AuthenticatedUser | null>;
  signIn: () => Promise<AuthenticatedUser>;
  signOut: () => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<AuthenticatedUser>;
  clearPendingLaunchNotification: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const MOBILE_PLATFORM_HEADER =
  typeof navigator !== "undefined" ? navigator.userAgent : "capacitor";

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isNative, setIsNative] = useState(false);
  const [startupResolved, setStartupResolved] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("unknown");
  const [authenticatedUser, setAuthenticatedUser] =
    useState<AuthenticatedUser | null>(null);
  const [hasPendingLaunchNotification, setHasPendingLaunchNotification] =
    useState(false);
  const startupRouteNormalizedRef = useRef(false);
  const loadSessionPromiseRef = useRef<Promise<AuthenticatedUser | null> | null>(
    null,
  );
  const signInPromiseRef = useRef<Promise<AuthenticatedUser> | null>(null);

  const loadSession = async () => {
    if (loadSessionPromiseRef.current) {
      return loadSessionPromiseRef.current;
    }

    const task = (async () => {
      if (!isNativePlatform()) {
        setAuthStatus("signed_out");
        setAuthenticatedUser(null);
        return null;
      }

      const response = await fetch("/api/auth/session", {
        headers: {
          "x-capacitor-platform": MOBILE_PLATFORM_HEADER,
        },
      }).catch(() => null);

      if (!response?.ok) {
        setAuthenticatedUser(null);
        setAuthStatus("signed_out");
        return null;
      }

      const payload = (await response.json().catch(() => ({}))) as {
        user?: AuthenticatedUser | null;
      };
      const user = payload.user || null;
      setAuthenticatedUser(user);
      setAuthStatus(user ? "signed_in" : "signed_out");
      return user;
    })();

    loadSessionPromiseRef.current = task;

    if (!isNativePlatform()) {
      return task.finally(() => {
        loadSessionPromiseRef.current = null;
      });
    }

    try {
      return await task;
    } finally {
      loadSessionPromiseRef.current = null;
    }
  };

  useEffect(() => {
    const native = isNativePlatform();
    setIsNative(native);
    if (native) {
      void (async () => {
        const pendingLaunchNotification =
          await peekNativeLaunchNotification().catch(() => null);
        setHasPendingLaunchNotification(Boolean(pendingLaunchNotification));
        await loadSession().catch(() => null);
      })().finally(() => setStartupResolved(true));
      return;
    }
    setAuthStatus("signed_out");
    setAuthenticatedUser(null);
    setStartupResolved(true);
  }, []);

  useEffect(() => {
    if (startupRouteNormalizedRef.current) return;
    if (!router.isReady) return;
    if (!startupResolved) return;
    if (!isNative) {
      startupRouteNormalizedRef.current = true;
      return;
    }

    const sessionId =
      typeof router.query.sessionId === "string" ? router.query.sessionId : null;
    const isEntryRoute =
      router.pathname === "/" ||
      router.pathname === "/landing" ||
      router.pathname === "/login" ||
      router.pathname === "/create";

    startupRouteNormalizedRef.current = true;

    if (hasPendingLaunchNotification) {
      return;
    }

    if (!isEntryRoute || sessionId || typeof window === "undefined") {
      return;
    }

    if (authStatus === "signed_in" && router.pathname !== "/dashboard") {
      window.location.replace("/dashboard");
      return;
    }

    if (authStatus === "signed_out" && router.pathname !== "/login") {
      window.location.replace("/login?redirect=/dashboard");
    }
  }, [
    authStatus,
    hasPendingLaunchNotification,
    isNative,
    router.isReady,
    router.pathname,
    router.query.sessionId,
    startupResolved,
  ]);

  useEffect(() => {
    if (!authenticatedUser) return;
    registerUserPushSubscription().catch(() => undefined);
  }, [authenticatedUser?.id]);

  useEffect(() => {
    if (!isNative || !authenticatedUser) return;

    let handle:
      | {
          remove: () => Promise<void>;
        }
      | undefined;

    const init = async () => {
      handle = await addNativeTokenRefreshListener(async ({ token }) => {
        if (!token) return;
        await fetch("/api/push/register-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "fcm",
            platform: "android",
            token,
          }),
        }).catch(() => undefined);
      }).catch(() => undefined);
    };

    void init();

    return () => {
      void handle?.remove();
    };
  }, [authenticatedUser?.id, isNative]);

  useForegroundResume(() => {
    if (!isNativePlatform()) return;
    if (!startupResolved) return;
    void loadSession().catch(() => undefined);
  });

  const signIn = async () => {
    if (signInPromiseRef.current) {
      return signInPromiseRef.current;
    }

    setAuthStatus("signing_in");
    const task = (async () => {
      try {
        const nativeResult = await signInWithNativeGoogle();
        if (!nativeResult.authenticated || !nativeResult.user) {
          setAuthStatus("signed_out");
          throw new Error("Unable to sign in.");
        }
        setAuthenticatedUser(nativeResult.user);
        setAuthStatus("signed_in");
        return nativeResult.user;
      } catch (error) {
        setAuthStatus("signed_out");
        throw error;
      }
    })();

    signInPromiseRef.current = task;

    try {
      return await task;
    } finally {
      signInPromiseRef.current = null;
    }
  };

  const signOut = async () => {
    await unregisterUserPushSubscription().catch(() => undefined);
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: {
        "x-capacitor-platform": MOBILE_PLATFORM_HEADER,
      },
    }).catch(() => undefined);
    await signOutOfNativeGoogle().catch(() => undefined);
    setAuthenticatedUser(null);
    setAuthStatus("signed_out");
  };

  const updateDisplayName = async (displayName: string) => {
    const response = await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-capacitor-platform": MOBILE_PLATFORM_HEADER,
      },
      body: JSON.stringify({ displayName }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      user?: AuthenticatedUser;
      message?: string;
    };
    if (!response.ok || !payload.user) {
      throw new Error(payload.message || "Unable to update profile.");
    }
    setAuthenticatedUser(payload.user);
    setAuthStatus("signed_in");
    return payload.user;
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      authStatus,
      authenticatedUser,
      isNative,
      startupResolved,
      hasPendingLaunchNotification,
      loadSession,
      signIn,
      signOut,
      updateDisplayName,
      clearPendingLaunchNotification: () => setHasPendingLaunchNotification(false),
    }),
    [
      authStatus,
      authenticatedUser,
      hasPendingLaunchNotification,
      isNative,
      startupResolved,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
};
