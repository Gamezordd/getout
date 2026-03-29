import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthenticatedUser, AuthStatus } from "../authTypes";
import {
  registerUserPushSubscription,
  unregisterUserPushSubscription,
} from "../pushClient";
import {
  isNativePlatform,
  signInWithNativeGoogle,
  signOutOfNativeGoogle,
} from "../nativeGoogleAuth";
import { addNativeTokenRefreshListener } from "../nativeNotifications";

type AuthContextValue = {
  authStatus: AuthStatus;
  authenticatedUser: AuthenticatedUser | null;
  isNative: boolean;
  loadSession: () => Promise<AuthenticatedUser | null>;
  signIn: () => Promise<AuthenticatedUser>;
  signOut: () => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<AuthenticatedUser>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const MOBILE_PLATFORM_HEADER =
  typeof navigator !== "undefined" ? navigator.userAgent : "capacitor";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isNative, setIsNative] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("unknown");
  const [authenticatedUser, setAuthenticatedUser] =
    useState<AuthenticatedUser | null>(null);

  const loadSession = async () => {
    if (!isNativePlatform()) {
      setAuthStatus("signed_out");
      setAuthenticatedUser(null);
      return null;
    }

    const response = await fetch("/api/auth/session", {
      headers: {
        "x-capacitor-platform": MOBILE_PLATFORM_HEADER,
      },
    });
    if (!response.ok) {
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
  };

  useEffect(() => {
    const native = isNativePlatform();
    setIsNative(native);
    if (native) {
      void loadSession();
      return;
    }
    setAuthStatus("signed_out");
    setAuthenticatedUser(null);
  }, []);

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

  const signIn = async () => {
    setAuthStatus("signing_in");
    const nativeResult = await signInWithNativeGoogle();
    const response = await fetch("/api/auth/mobile/google", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-capacitor-platform": MOBILE_PLATFORM_HEADER,
      },
      body: JSON.stringify({ idToken: nativeResult.idToken }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      user?: AuthenticatedUser;
      message?: string;
    };
    if (!response.ok || !payload.user) {
      setAuthStatus("signed_out");
      throw new Error(payload.message || "Unable to sign in.");
    }
    setAuthenticatedUser(payload.user);
    setAuthStatus("signed_in");
    return payload.user;
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
      loadSession,
      signIn,
      signOut,
      updateDisplayName,
    }),
    [authStatus, authenticatedUser, isNative],
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
