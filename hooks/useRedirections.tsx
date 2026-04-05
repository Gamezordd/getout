import { useRouter } from "next/router";
import { useAppStore } from "../lib/store/AppStoreProvider";
import { useEffect } from "react";
import { useAuth } from "../lib/auth/AuthProvider";

export default function useRedirections() {
  const store = useAppStore();
  const router = useRouter();
  const { authStatus, hasPendingLaunchNotification, isNative, startupResolved } =
    useAuth();
  useEffect(() => {
    if (!router.isReady) return;
    if (!startupResolved) return;
    if (hasPendingLaunchNotification) return;

    const sessionId =
      typeof router.query.sessionId === "string"
        ? router.query.sessionId
        : null;

    if (!sessionId) {
      if (isNative && authStatus === "signed_out") {
        router.replace(
          { pathname: "/login", query: { redirect: "/dashboard" } },
          undefined,
          { shallow: true },
        );
        return;
      }
      if (isNative && authStatus === "signed_in") {
        router.replace({ pathname: "/dashboard" }, undefined, {
          shallow: true,
        });
        return;
      }
      router.replace({ pathname: "/landing" }, undefined, { shallow: true });
      return;
    }

    store.setSession(sessionId, router.pathname);
  }, [
    authStatus,
    hasPendingLaunchNotification,
    isNative,
    router.isReady,
    router.pathname,
    router.query.sessionId,
    startupResolved,
    store,
  ]);

  useEffect(() => {
    if (!router.isReady || !store.sessionId || store.isLoadingGroup) return;
    if (!store.lockedVenue) return;
    if (router.pathname === "/final") return;

    router.replace(
      { pathname: "/final", query: { sessionId: store.sessionId } },
      undefined,
      {
        shallow: true,
      },
    );
  }, [
    router,
    router.isReady,
    router.pathname,
    store.isLoadingGroup,
    store.lockedVenue,
    store.sessionId,
  ]);

  useEffect(() => {
    if (!router.isReady || !store.sessionId || !store.identityResolved) return;
    if (store.lockedVenue) return;
    if (store.currentUserId) return;

    if (!startupResolved) return;
    if (isNative && authStatus === "signed_out") {
      router.replace(
        {
          pathname: "/login",
          query: {
            redirect: `/join?sessionId=${encodeURIComponent(store.sessionId)}`,
          },
        },
        undefined,
        {
          shallow: true,
        },
      );
      return;
    }

    router.replace(
      { pathname: "/join", query: { sessionId: store.sessionId } },
      undefined,
      {
        shallow: true,
      },
    );
  }, [
    router,
    router.isReady,
    store.currentUserId,
    store.identityResolved,
    store.lockedVenue,
    store.sessionId,
    authStatus,
    isNative,
    startupResolved,
  ]);

  useEffect(() => {
    if (!router.isReady) return;
    const venueIdFromUrl =
      typeof router.query.venueId === "string" ? router.query.venueId : null;
    if (venueIdFromUrl !== store.selectedVenueId && !store.selectedVenueId) {
      store.setSelectedVenue(venueIdFromUrl);
    }
  }, [router.isReady, router.query.venueId, store]);

  useEffect(() => {
    if (!router.isReady || !store.sessionId) return;

    const currentVenueId =
      typeof router.query.venueId === "string" ? router.query.venueId : null;
    if (currentVenueId === store.selectedVenueId) return;

    const nextQuery: Record<string, string> = { sessionId: store.sessionId };
    if (store.selectedVenueId) {
      nextQuery.venueId = store.selectedVenueId;
    }

    router.replace({ pathname: router.pathname, query: nextQuery }, undefined, {
      shallow: true,
      scroll: false,
    });
  }, [
    router,
    router.isReady,
    router.pathname,
    router.query.venueId,
    store.selectedVenueId,
    store.sessionId,
  ]);
}
