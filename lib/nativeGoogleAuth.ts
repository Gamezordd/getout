import { Capacitor, registerPlugin } from "@capacitor/core";
export { addNativeTokenRefreshListener } from "./nativeNotifications";
import type { AuthenticatedUser } from "./authTypes";

type NativeSessionResult = {
  authenticated: boolean;
  user?: AuthenticatedUser | null;
};

type NativeGoogleAuthPlugin = {
  signIn: () => Promise<NativeSessionResult>;
  restoreSession: () => Promise<NativeSessionResult>;
  signOut: () => Promise<void>;
};

const NativeGoogleAuth = registerPlugin<NativeGoogleAuthPlugin>("GoogleAuth");

export const isNativePlatform = () => Capacitor.isNativePlatform();

export const signInWithNativeGoogle = async () => NativeGoogleAuth.signIn();

export const restoreNativeGoogleSession = async () =>
  NativeGoogleAuth.restoreSession();

export const signOutOfNativeGoogle = async () => NativeGoogleAuth.signOut();
