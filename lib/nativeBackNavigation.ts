import { App as CapacitorApp } from "@capacitor/app";

export const isNativeDashboardBackRoute = (params: {
  pathname: string;
  sessionId: string | null;
}) => {
  const { pathname, sessionId } = params;
  return pathname === "/landing" || (pathname === "/" && Boolean(sessionId));
};

export const addNativeBackButtonListener = async (
  listener: () => void,
) => {
  return CapacitorApp.addListener("backButton", listener);
};
