import { App as CapacitorApp } from "@capacitor/app";

type NativeBackInterceptor = () => boolean;

let activeNativeBackInterceptor: NativeBackInterceptor | null = null;

export const isNativeDashboardBackRoute = (params: {
  pathname: string;
  sessionId: string | null;
}) => {
  const { pathname, sessionId } = params;
  return (
    pathname === "/landing" ||
    pathname === "/final" ||
    (pathname === "/" && Boolean(sessionId))
  );
};

export const addNativeBackButtonListener = async (
  listener: () => void,
) => {
  return CapacitorApp.addListener("backButton", listener);
};

export const registerNativeBackInterceptor = (
  interceptor: NativeBackInterceptor,
) => {
  activeNativeBackInterceptor = interceptor;

  return () => {
    if (activeNativeBackInterceptor === interceptor) {
      activeNativeBackInterceptor = null;
    }
  };
};

export const consumeNativeBackPress = () => {
  if (!activeNativeBackInterceptor) {
    return false;
  }

  return activeNativeBackInterceptor();
};
