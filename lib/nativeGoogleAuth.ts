import { Capacitor, registerPlugin } from "@capacitor/core";
export { addNativeTokenRefreshListener } from "./nativeNotifications";

type GoogleAuthResult = {
  idToken: string;
};

type NativeGoogleAuthPlugin = {
  signIn: () => Promise<GoogleAuthResult>;
  signOut: () => Promise<void>;
};

const NativeGoogleAuth = registerPlugin<NativeGoogleAuthPlugin>("GoogleAuth");

export const isNativePlatform = () => Capacitor.isNativePlatform();

export const signInWithNativeGoogle = async () => NativeGoogleAuth.signIn();

export const signOutOfNativeGoogle = async () => NativeGoogleAuth.signOut();
